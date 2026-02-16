
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, BatchGetCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { createShippingNotificationEmail } from './templates/email';
import { sendEmail } from './utils/email-client';

const client = new DynamoDBClient({});
// const ses = new SESClient({}); // Removed SES for Resend
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || '';
// const SENDER_EMAIL = process.env.SENDER_EMAIL; // Handled in email-client
const INDEX_NAME = 'GSI1';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,GET,PATCH'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        const path = event.path;
        const method = event.httpMethod;

        // Route: GET /shop/{shopId}/orders
        if (method === 'GET' && path.includes('/shop/')) {
            const shopId = event.pathParameters?.shopId;
            if (!shopId) return { statusCode: 400, headers: corsHeaders, body: 'Missing Shop ID' };
            return handleListShopOrders(shopId);
        }

        // Route: PATCH /shop/{shopId}/orders/{qrId}
        if (method === 'PATCH' && path.includes('/shop/')) {
            const qrId = event.pathParameters?.qrId; // mapped from {qrId} resource
            if (!qrId) return { statusCode: 400, headers: corsHeaders, body: 'Missing QR ID' };
            return handleUpdateOrder(event, qrId);
        }

        // Legacy / Global behavior (if any) or existing implementation
        // if (method === 'GET') {
        //     // Fallback to global list (prototype only, should be removed or restricted)
        //     // return handleListOrders();
        //     return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ orders: [] }) };
        // } else 
        // if (method === 'PATCH') {
        //     const uuid = event.pathParameters?.uuid;
        //     return handleUpdateOrder(event, uuid);
        // } else {
        return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' };
        // }
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Internal Server Error', error: String(error) })
        };
    }
};

async function handleListOrders() {
    // // 1. Find all items with status = 'USED' using GSI
    // // Note: detailed Access control (filtering by shop_id) is skipped for this prototype
    // const queryRes = await ddb.send(new QueryCommand({
    //     TableName: TABLE_NAME,
    //     IndexName: INDEX_NAME,
    //     KeyConditionExpression: 'GSI1_PK = :pk',
    //     ExpressionAttributeValues: { ':pk': 'QR#USED' }
    // }));

    // if (!queryRes.Items || queryRes.Items.length === 0) {
    //     return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ orders: [] }) };
    // }

    // // 2. We have METADATA items (PK=QR#uuid, SK=METADATA).
    // // We need ORDER items (PK=QR#uuid, SK=ORDER) to get address.
    // // We will do a BatchGet (handling max 100 items limitation simply for now).

    // // Construct keys for BatchGet
    // const keys = queryRes.Items.map(item => ({
    //     PK: item.PK,
    //     SK: 'ORDER'
    // }));

    // // In a real app we would chunk 'keys' into batches of 100 (or 25 for BatchWrite). BatchGet limit is 100.
    // // Ideally we merge metadata (product_id) with order data (address).

    // // For simplicity, let's assume < 100 pending orders for this prototype step.
    // const batchRes = await ddb.send(new BatchGetCommand({
    //     RequestItems: {
    //         [TABLE_NAME]: {
    //             Keys: keys
    //         }
    //     }
    // }));

    // const orderDetailsMap = new Map();
    // (batchRes.Responses?.[TABLE_NAME] || []).forEach((item: any) => {
    //     orderDetailsMap.set(item.PK, item);
    // });

    // // Merge
    // const orders = queryRes.Items.map(meta => {
    //     const orderDetail = orderDetailsMap.get(meta.PK) || {};
    //     return {
    //         id: meta.PK.replace('QR#', ''), // uuid
    //         qr_id: meta.PK,
    //         product_id: meta.product_id,
    //         status: meta.status,
    //         recipient_name: orderDetail.name || 'Unknown',
    //         address: orderDetail.address || 'Unknown',
    //         postal_code: orderDetail.postal_code,
    //         shipping_info: orderDetail // full object
    //     };
    // });

    // return {
    //     statusCode: 200,
    //     headers: corsHeaders,
    //     body: JSON.stringify({ orders })
    // };
}

async function handleUpdateOrder(event: any, uuidParam?: string) {
    const uuid = uuidParam || event.pathParameters?.uuid;
    if (!uuid) return { statusCode: 400, headers: corsHeaders, body: 'Missing UUID' };

    const body = JSON.parse(event.body || '{}');
    const { delivery_company, tracking_number, memo_for_users, memo_for_shop } = body;

    // Fetch details for email notification (need PIN from METADATA and Email from ORDER)
    const metaRes = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `QR#${uuid}`, SK: 'METADATA' }
    }));
    const orderRes = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `QR#${uuid}`, SK: 'ORDER' }
    }));

    const updateExpParts = ['SET #status = :s', 'ts_shipped_at = :now', 'GSI1_PK = :gsi_pk'];
    const expAttrValues: any = {
        ':s': 'SHIPPED',
        ':now': new Date().toISOString(),
        ':gsi_pk': 'QR#SHIPPED'
    };
    const expAttrNames: any = { '#status': 'status' };

    if (memo_for_users !== undefined) {
        updateExpParts.push('memo_for_users = :mu');
        expAttrValues[':mu'] = memo_for_users;
    }
    if (memo_for_shop !== undefined) {
        updateExpParts.push('memo_for_shop = :ms');
        expAttrValues[':ms'] = memo_for_shop;
    }

    await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `QR#${uuid}`, SK: 'METADATA' },
        UpdateExpression: updateExpParts.join(', '),
        ExpressionAttributeNames: expAttrNames,
        ExpressionAttributeValues: expAttrValues
    }));

    // Update ORDER if tracking provided
    if (tracking_number) {
        await ddb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${uuid}`, SK: 'ORDER' },
            UpdateExpression: 'SET delivery_company = :d, tracking_number = :t, ts_shipped_at = :now, ts_updated_at = :now',
            ExpressionAttributeValues: {
                ':d': delivery_company,
                ':t': tracking_number,
                ':now': new Date().toISOString()
            }
        }));
    }

    // Send Shipping Notification Email
    const email = orderRes.Item?.email;
    const pin = metaRes.Item?.pin;

    if (email && pin) { // Checks are done in email-client
        try {
            // Check language preference if available (defaulting to ja for now)
            // Ideally we should store lang pref in ORDER or METADATA
            const lang = 'ja';

            const { subject, bodyText } = createShippingNotificationEmail({
                uuid,
                pin,
                lang
            });

            await sendEmail({
                to: [email],
                subject: subject,
                text: bodyText
            });
        } catch (e) {
            console.error('Failed to send shipping notification email', e);
            // Don't fail the request, just log
        }
    }

    return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Order marked as shipped' })
    };
}

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
            shipping_info: orderDetail,
            memo_for_users: meta.memo_for_users,
            memo_for_shop: meta.memo_for_shop,
            tracking_number: orderDetail.tracking_number,
            delivery_company: orderDetail.delivery_company,

            ts_created_at: meta.ts_created_at,
            ts_updated_at: meta.ts_updated_at,
            ts_linked_at: meta.ts_linked_at,
            ts_activated_at: meta.ts_activated_at,
            ts_submitted_at: meta.ts_submitted_at,
            ts_shipped_at: meta.ts_shipped_at,
            ts_completed_at: meta.ts_completed_at,
            ts_expired_at: meta.ts_expired_at,
            ts_banned_at: meta.ts_banned_at,
        };

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
    // Construct keys for BatchGet
    const keys = relevantItems.map(item => ({
        PK: item.PK,
        SK: 'ORDER'
    }));

    // Chunking not implemented for prototype (assume < 100)
    // If keys > 100, we should slice
    if (keys.length > 100) {
        // quick fix for prototype safety
        // keys.length = 100; 
        // But better to process in chunks if we want to support it. 
        // For now let's just warn or slice.
        console.warn("More than 100 items, truncating BatchGet");
        // We can't easily truncate 'relevantItems' parallel to 'keys' without slicing both.
        // Let's slice relevantItems first.
        relevantItems = relevantItems.slice(0, 100);
        // Reform keys
        const keysSliced = relevantItems.map(item => ({
            PK: item.PK,
            SK: 'ORDER'
        }));

        const batchRes = await ddb.send(new BatchGetCommand({
            RequestItems: {
                [TABLE_NAME]: {
                    Keys: keysSliced
                }
            }
        }));

        // ... process responses ...
        return processBatchResponses(batchRes, relevantItems);
    }

    const batchRes = await ddb.send(new BatchGetCommand({
        RequestItems: {
            [TABLE_NAME]: {
                Keys: keys
            }
        }
    }));

    return processBatchResponses(batchRes, relevantItems);
}

function processBatchResponses(batchRes: any, relevantItems: any[]) {
    const orderDetailsMap = new Map();
    (batchRes.Responses?.[TABLE_NAME] || []).forEach((item: any) => {
        orderDetailsMap.set(item.PK, item);
    });

    const orders = relevantItems.map(meta => {
        const orderDetail = orderDetailsMap.get(meta.PK) || {};
        // if (!orderDetail) return null; // Allow items without order details (e.g. LINKED, ACTIVE)
        return {
            id: meta.PK.replace('QR#', ''),
            qr_id: meta.PK,
            product_id: meta.product_id,
            status: meta.status,
            recipient_name: orderDetail.name || '-',
            address: orderDetail.address || '-',
            postal_code: orderDetail.zipCode || orderDetail.postal_code || '',
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
        };
    });

    return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ orders })
    };
}
