
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, BatchGetCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { sendLocalizedEmail } from './templates/email';
import { sendEmail } from './utils/email-client';
import { checkShopOwnerOrGM } from './share/shop-auth';
import { signUrlIfS3 } from './utils/s3';

const client = new DynamoDBClient({});
// const ses = new SESClient({}); // Removed SES for Resend
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || '';
// const SENDER_EMAIL = process.env.SENDER_EMAIL; // Handled in email-client
const BUCKET_NAME = process.env.BUCKET_NAME || '';
const INDEX_NAME = 'GSI1';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,PATCH'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        const path = event.path;
        const method = event.httpMethod;

        const claims = event.requestContext?.authorizer?.claims;
        const userId = claims?.sub;
        const userGroups = (claims?.['cognito:groups'] as string[]) || [];
        const shopId = event.pathParameters?.shopId;

        if (!userId || !shopId) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ message: 'Unauthorized' }) };
        }

        // Verify Shop Ownership
        const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId, userId, event);

        if (!shopMetadata) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ message: 'Unauthorized' }) };
        }
        //////////// ここから下は 認証済みかつショップオーナーのみアクセス可能


        // Route: GET /shop/{shopId}/orders
        if (method === 'GET' && path.includes('/shop/')) {
            return handleListShopOrders(shopId); //権限確認なし注意
        }

        // Route: PATCH /shop/{shopId}/orders/{qrId} // 配送情報入力
        if (method === 'PATCH' && path.includes('/shop/')) {
            return handleUpdateOrder(event); //権限確認なし注意
        }

        return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };

    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Internal Server Error', error: String(error) })
        };
    }
};

// 内部で権限確認なし注意
async function handleListShopOrders(shopId: string, queryParams?: any) {
    const uuidFilter = queryParams?.uuid;

    let relevantItems: any[] = [];

    if (uuidFilter) {
        // 1a. Efficient Lookup by UUID
        // We query by PK = QR#<uuidFilter>
        // Use Query instead of GetItem to fetch both METADATA and ORDER items if possible?
        // Actually, our Single Table Design:
        // PK=QR#uuid, SK=METADATA
        // PK=QR#uuid, SK=ORDER
        // So Query with PK=QR#uuid will get both!
        const queryRes = await ddb.send(new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk',
            ExpressionAttributeValues: { ':pk': `QR#${uuidFilter}` }
        }));

        const items = queryRes.Items || [];
        // Check ownership
        // We look for the METADATA item to check shop_id
        const metadata = items.find(i => i.SK === 'METADATA');
        if (!metadata || metadata.shop_id !== shopId) {
            // Not found or not owned by this shop
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ orders: [] }) };
        }

        // If owned, we have the items. We need to split them into "relevantItems" meta and map order details later?
        // Or just construct it here.
        // The existing logic expects "relevantItems" to be metadata items.
        relevantItems = [metadata];

        // We already have the ORDER item in 'items'. We can pass it or cache it?
        // To reuse the logic below, we can let the BatchGet happen (it will be 1 item), OR optimize.
        // Let's optimize: we already have the order details.

        const orderDetail = items.find(i => i.SK === 'ORDER') || {};
        const meta = metadata;

        const order = {
            id: meta.PK.replace('QR#', ''),
            qr_id: meta.PK,
            product_id: meta.product_id,
            status: meta.status,
            recipient_name: orderDetail.name || '-',
            address: orderDetail.address || '-',
            postal_code: orderDetail.zipCode || orderDetail.postal_code || '',
            preferred_date: orderDetail.preferredDate || '-',
            preferred_time: orderDetail.preferredTime || '-',
            shipping_info: orderDetail,
            memo_for_users: meta.memo_for_users,
            memo_for_shop: meta.memo_for_shop,
            tracking_number: orderDetail.tracking_number,
            delivery_company: orderDetail.delivery_company,

            ts_expired_at: meta.ts_expired_at,
            ts_banned_at: meta.ts_banned_at,
            card_design: meta.card_design
        };

        // Enrich with Card Design Thumbnails
        if (order.card_design) {
            const designRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: 'CARD_DESIGN#METADATA', SK: order.card_design }
            }));
            if (designRes.Item) {
                const design = designRes.Item;
                (order as any).thumbf = await signUrlIfS3(design.thumbf, BUCKET_NAME);
                (order as any).thumbb = await signUrlIfS3(design.thumbb, BUCKET_NAME);
            }
        }

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ orders: [order] })
        };

    } else {
        // 1b. List All (via GSI2)
        const queryRes = await ddb.send(new QueryCommand({
            TableName: TABLE_NAME,
            IndexName: 'GSI2',
            KeyConditionExpression: 'GSI2_PK = :sid',
            ExpressionAttributeValues: { ':sid': `SHOP#${shopId}` }
        }));

        if (!queryRes.Items || queryRes.Items.length === 0) {
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ orders: [] }) };
        }
        relevantItems = queryRes.Items;
    }

    // 3. BatchGet to get details (ORDER sk)
    const allOrderDetails: any[] = [];
    for (let i = 0; i < relevantItems.length; i += 100) {
        const chunk = relevantItems.slice(i, i + 100);
        const keys = chunk.map(item => ({
            PK: item.PK,
            SK: 'ORDER'
        }));

        const batchRes = await ddb.send(new BatchGetCommand({
            RequestItems: {
                [TABLE_NAME]: {
                    Keys: keys
                }
            }
        }));

        if (batchRes.Responses?.[TABLE_NAME]) {
            allOrderDetails.push(...batchRes.Responses[TABLE_NAME]);
        }
    }

    // 4. Enrich with Card Design Thumbnails
    const designIds = [...new Set(relevantItems.map((i: any) => i.card_design).filter(Boolean))];
    const designMap = new Map<string, any>();

    if (designIds.length > 0) {
        const chunkedDesignIds = [];
        for (let i = 0; i < designIds.length; i += 100) {
            chunkedDesignIds.push(designIds.slice(i, i + 100));
        }

        for (const chunk of chunkedDesignIds) {
            const keys = chunk.map(id => ({ PK: 'CARD_DESIGN#METADATA', SK: id }));
            const batchRes = await ddb.send(new BatchGetCommand({
                RequestItems: {
                    [TABLE_NAME]: {
                        Keys: keys,
                        ProjectionExpression: 'SK, thumbf, thumbb'
                    }
                }
            }));

            if (batchRes.Responses && batchRes.Responses[TABLE_NAME]) {
                for (const design of batchRes.Responses[TABLE_NAME]) {
                    if (design.thumbf) design.thumbf = await signUrlIfS3(design.thumbf, BUCKET_NAME);
                    if (design.thumbb) design.thumbb = await signUrlIfS3(design.thumbb, BUCKET_NAME);
                    designMap.set(design.SK, design);
                }
            }
        }
    }

    return renderOrderItems(allOrderDetails, relevantItems, designMap);
}

function renderOrderItems(allOrderDetails: any[], relevantItems: any[], designMap: Map<string, any>) {
    const orderDetailsMap = new Map();
    allOrderDetails.forEach((item: any) => {
        orderDetailsMap.set(item.PK, item);
    });

    const orders = relevantItems.map(meta => {
        const orderDetail = orderDetailsMap.get(meta.PK) || {};
        const design = meta.card_design ? designMap.get(meta.card_design) : null;
        // if (!orderDetail) return null; // Allow items without order details (e.g. LINKED, ACTIVE)
        return {
            id: meta.PK.replace('QR#', ''),
            qr_id: meta.PK,
            product_id: meta.product_id,
            status: meta.status,
            recipient_name: orderDetail.name || '-',
            address: orderDetail.address || '-',
            postal_code: orderDetail.zipCode || orderDetail.postal_code || '',
            preferred_date: orderDetail.preferredDate || '-',
            preferred_time: orderDetail.preferredTime || '-',
            shipping_info: orderDetail,
            memo_for_users: meta.memo_for_users,
            memo_for_shop: meta.memo_for_shop,
            tracking_number: orderDetail.tracking_number,
            delivery_company: orderDetail.delivery_company,

            ts_created_at: meta.ts_created_at, // QR creation                   
            ts_updated_at: meta.ts_updated_at,
            ts_linked_at: meta.ts_linked_at,
            ts_activated_at: meta.ts_activated_at,
            ts_submitted_at: meta.ts_submitted_at,
            ts_shipped_at: meta.ts_shipped_at,
            ts_completed_at: meta.ts_completed_at,
            ts_expired_at: meta.ts_expired_at,
            ts_banned_at: meta.ts_banned_at,
            card_design: meta.card_design,
            thumbf: design?.thumbf,
            thumbb: design?.thumbb
        };
    });

    return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ orders })
    };
}

//内部で権限確認なし注意 -> 修正: 権限確認を追加
async function handleUpdateOrder(event: any) {
    const qrId = event.pathParameters?.qrId; // uuid から qrId に変更
    if (!qrId) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing qr_id' }) };
    const shopId = event.pathParameters?.shopId;
    if (!shopId) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Shop ID not found' }) };

    const body = JSON.parse(event.body || '{}');
    const { delivery_company, tracking_number, memo_for_users, memo_for_shop } = body;
    const metaRes = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `QR#${qrId}`, SK: 'METADATA' }
    }));
    if (!metaRes.Item) {
        return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Order not found' }) };
    }

    // セキュリティチェック: このQRコードが指定されたショップのものであるか確認
    if (metaRes.Item.shop_id !== shopId) {
        return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'QR does not belong to this shop' }) };
    }

    const currentStatus = metaRes.Item.status;
    const isShippingTransition = (delivery_company || tracking_number) && currentStatus === 'USED';

    // Update METADATA
    const updateExpPartsMeta = [];
    const expAttrValuesMeta: any = {};
    const expAttrNamesMeta: any = {};

    if (isShippingTransition) {
        updateExpPartsMeta.push('#status = :s', 'ts_shipped_at = :now', 'GSI1_PK = :gsi_pk');
        expAttrValuesMeta[':s'] = 'SHIPPED';
        expAttrValuesMeta[':now'] = new Date().toISOString();
        expAttrValuesMeta[':gsi_pk'] = 'QR#SHIPPED';
        expAttrNamesMeta['#status'] = 'status';
    }

    if (memo_for_users !== undefined) {
        // メッセージは完了以前のステートのみ
        if (!['COMPLETED', 'EXPIRED', 'BANNED'].includes(currentStatus)) {
            updateExpPartsMeta.push('memo_for_users = :mu');
            expAttrValuesMeta[':mu'] = memo_for_users;
        }
    }

    if (memo_for_shop !== undefined) {
        // メモはすべての状態に対して
        updateExpPartsMeta.push('memo_for_shop = :ms');
        expAttrValuesMeta[':ms'] = memo_for_shop;
    }

    if (updateExpPartsMeta.length > 0) {
        updateExpPartsMeta.push('ts_updated_at = :now');
        expAttrValuesMeta[':now'] = expAttrValuesMeta[':now'] || new Date().toISOString();

        await ddb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${qrId}`, SK: 'METADATA' },
            UpdateExpression: 'SET ' + updateExpPartsMeta.join(', '),
            ExpressionAttributeValues: expAttrValuesMeta,
            ExpressionAttributeNames: Object.keys(expAttrNamesMeta).length > 0 ? expAttrNamesMeta : undefined,
        }));
    }

    // Update ORDER if tracking provided and ORDER exists (ONLY when status is USED)
    if ((tracking_number || delivery_company) && currentStatus === 'USED') {
        const orderRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${qrId}`, SK: 'ORDER' }
        }));

        if (orderRes.Item) {
            const updateExpPartsOrder = [];
            const expAttrValuesOrder: any = {};

            if (delivery_company !== undefined) {
                updateExpPartsOrder.push('delivery_company = :d');
                expAttrValuesOrder[':d'] = delivery_company;
            }
            if (tracking_number !== undefined) {
                updateExpPartsOrder.push('tracking_number = :t');
                expAttrValuesOrder[':t'] = tracking_number;
            }

            updateExpPartsOrder.push('ts_updated_at = :now');
            expAttrValuesOrder[':now'] = new Date().toISOString();

            if (isShippingTransition) {
                updateExpPartsOrder.push('ts_shipped_at = :now');
            }

            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${qrId}`, SK: 'ORDER' },
                UpdateExpression: 'SET ' + updateExpPartsOrder.join(', '),
                ExpressionAttributeValues: expAttrValuesOrder
            }));
        }
    }

    // Send Shipping Notification Email ONLY if transitioning from USED to SHIPPED
    if (isShippingTransition) {
        const orderRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${qrId}`, SK: 'ORDER' }
        }));
        const email = orderRes.Item?.email;
        const pin = metaRes.Item?.pin;
        if (email && pin) {
            try {
                const lang = 'ja';
                await sendLocalizedEmail({
                    type: 'SHIPPING_NOTIFICATION',
                    to: email,
                    params: {
                        uuid: qrId,
                        pin
                    },
                    lang
                });
            } catch (e) {
                console.error('Failed to send shipping notification email', e);
            }
        }
    }

    return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: isShippingTransition ? 'Order marked as shipped' : 'Order meta updated' })
    };
}
