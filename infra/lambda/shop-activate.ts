
// import { APIGatewayProxyHandler } from 'aws-lambda';
// import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
// import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

// const client = new DynamoDBClient({});
// const ddb = DynamoDBDocumentClient.from(client);
// const TABLE_NAME = process.env.TABLE_NAME || '';

// const corsHeaders = {
//     'Access-Control-Allow-Origin': '*',
//     'Access-Control-Allow-Headers': 'Content-Type,Authorization',
//     'Access-Control-Allow-Methods': 'OPTIONS,POST'
// };

// export const handler: APIGatewayProxyHandler = async (event) => {
//     try {
//         if (event.httpMethod !== 'POST') {
//             return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' };
//         }

//         const body = JSON.parse(event.body || '{}');
//         const { qr_id, product_id, shop_id, action, activate_now } = body; // action: 'LINK' | 'ACTIVATE'

//         if (!qr_id) {
//             return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing qr_id' }) };
//         }

//         if (action === 'LINK') {
//             if (!product_id || !shop_id) {
//                 return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing product_id or shop_id for LINK action' }) };
//             }

//             // Fetch Product to get valid_days
//             const prodRes = await ddb.send(new GetCommand({
//                 TableName: TABLE_NAME,
//                 Key: { PK: `SHOP#${shop_id}`, SK: `PRODUCT#${product_id}` }
//             }));

//             // If product doesn't exist, we could error, but let's just default
//             const validDays = (prodRes.Item && prodRes.Item.valid_days) ? prodRes.Item.valid_days : parseInt(process.env.DEFAULT_VALID_DAYS || '1');

//             const targetStatus = activate_now ? 'ACTIVE' : 'LINKED';
//             let updateExp = 'SET #status = :target, product_id = :pid, shop_id = :sid';
//             const expValues: any = {
//                 ':target': targetStatus,
//                 ':pid': product_id,
//                 ':sid': shop_id,
//                 ':unassigned': 'UNASSIGNED'
//             };

//             updateExp += ', updated_at = :now';
//             updateExp += ', linked_at = :now';
//             const now = new Date();
//             expValues[':now'] = now.toISOString();

//             if (activate_now) {
//                 updateExp += ', activated_at = :now';
//                 const expiresAt = new Date(now);
//                 expiresAt.setDate(expiresAt.getDate() + validDays);
//                 updateExp += ', expires_at = :exp';
//                 expValues[':exp'] = expiresAt.toISOString();
//             }

//             const { memo_for_users, memo_for_shop } = body;
//             if (memo_for_users) {
//                 updateExp += ', memo_for_users = :mu';
//                 expValues[':mu'] = memo_for_users;
//             }
//             if (memo_for_shop) {
//                 updateExp += ', memo_for_shop = :ms';
//                 expValues[':ms'] = memo_for_shop;
//             }

//             await ddb.send(new UpdateCommand({
//                 TableName: TABLE_NAME,
//                 Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
//                 UpdateExpression: updateExp,
//                 ConditionExpression: '#status = :unassigned',
//                 ExpressionAttributeNames: { '#status': 'status' },
//                 ExpressionAttributeValues: expValues
//             }));

//             return {
//                 statusCode: 200,
//                 headers: corsHeaders,
//                 body: JSON.stringify({ message: `QR Code ${activate_now ? 'Activated' : 'Linked'}`, status: 'success' })
//             };

//         } else if (action === 'ACTIVATE') {
//             // Activate an already LINKED code
//             // Need to fetch QR first to get product_id and shop_id
//             const qrRes = await ddb.send(new GetCommand({
//                 TableName: TABLE_NAME,
//                 Key: { PK: `QR#${qr_id}`, SK: 'METADATA' }
//             }));

//             if (!qrRes.Item) {
//                 return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'QR not found' }) };
//             }

//             const currentStatus = qrRes.Item.status;
//             if (currentStatus !== 'LINKED') {
//                 return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: `QR is not LINKED (current: ${currentStatus})` }) };
//             }

//             const pId = qrRes.Item.product_id;
//             const sId = qrRes.Item.shop_id;

//             // Fetch Product
//             const prodRes = await ddb.send(new GetCommand({
//                 TableName: TABLE_NAME,
//                 Key: { PK: `SHOP#${sId}`, SK: `PRODUCT#${pId}` }
//             }));

//             const validDays = (prodRes.Item && prodRes.Item.valid_days) ? prodRes.Item.valid_days : parseInt(process.env.DEFAULT_VALID_DAYS || '1');
//             const now = new Date();
//             const expiresAt = new Date(now);
//             expiresAt.setDate(expiresAt.getDate() + validDays);

//             await ddb.send(new UpdateCommand({
//                 TableName: TABLE_NAME,
//                 Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
//                 UpdateExpression: 'SET #status = :active, activated_at = :now, updated_at = :now, expires_at = :exp',
//                 ConditionExpression: '#status = :linked',
//                 ExpressionAttributeNames: { '#status': 'status' },
//                 ExpressionAttributeValues: {
//                     ':active': 'ACTIVE',
//                     ':linked': 'LINKED',
//                     ':now': now.toISOString(),
//                     ':exp': expiresAt.toISOString()
//                 }
//             }));

//             return {
//                 statusCode: 200,
//                 headers: corsHeaders,
//                 body: JSON.stringify({ message: 'Activation completed', status: 'success' })
//             };

//         } else {
//             return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid action' }) };
//         }


//     } catch (error: any) {
//         console.error(error);
//         if (error.name === 'ConditionalCheckFailedException') {
//             return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'QR Code not in valid state for requested action' }) };
//         }
//         return {
//             statusCode: 500,
//             headers: corsHeaders,
//             body: JSON.stringify({ message: 'Internal Server Error' })
//         };
//     }
// };
