
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, BatchGetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || '';
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

    // Transactionally update METADATA status and ORDER details?
    // Or just update individually. For SHIPPED, updating METADATA is critical for list removal.
    // Lets update METADATA status -> SHIPPED.
    // And update ORDER item -> add tracking number.

    // We can do TransactWriteItems
    // 1. Update METADATA: status='SHIPPED', ts_shipped_at=now, memos...
    // 2. Update ORDER: tracking_number=..., ts_shipped_at=now

    // But for simplicity in lambda-nodejs, let's do simple update
    // Update METADATA is most important for the Dashboard list.

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

    return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Order marked as shipped' })
    };
}

async function handleListShopOrders(shopId: string) {
    // 1. Query GSI2 for all QRs in this shop
    const queryRes = await ddb.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2_PK = :sid',
        ExpressionAttributeValues: { ':sid': `SHOP#${shopId}` }
    }));

    if (!queryRes.Items || queryRes.Items.length === 0) {
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ orders: [] }) };
    }

    // 2. Filter for status = 'USED' (Ready) or 'SHIPPED'
    // const relevantItems = queryRes.Items.filter(item =>
    //     ['USED', 'SHIPPED'].includes(item.status)
    // );
    const relevantItems = queryRes.Items

    if (relevantItems.length === 0) {
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ orders: [] }) };
    }

    // 3. BatchGet to get details (ORDER sk)
    // Construct keys for BatchGet
    const keys = relevantItems.map(item => ({
        PK: item.PK,
        SK: 'ORDER'
    }));

    // Chunking not implemented for prototype (assume < 100)
    const batchRes = await ddb.send(new BatchGetCommand({
        RequestItems: {
            [TABLE_NAME]: {
                Keys: keys
            }
        }
    }));

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
            ordered_at: orderDetail.ts_submitted_at, // Best effort date
            ts_created_at: meta.ts_created_at, // QR creation
            ts_shipped_at: orderDetail.ts_shipped_at,
            ts_updated_at: meta.ts_updated_at,
            ts_activated_at: meta.ts_activated_at,

        };
    });

    return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ orders })
    };
}
