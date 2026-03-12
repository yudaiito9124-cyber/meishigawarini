import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { generateId } from './utils/id';
import { verifyAdmin } from './share/admin-auth-inlambda';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const cognito = new CognitoIdentityProviderClient({});

const TABLE_NAME = process.env.TABLE_NAME || '';
const USER_POOL_ID = process.env.USER_POOL_ID || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    // Verify admin
    const { isAdmin, errorResponse } = verifyAdmin(event);
    if (!isAdmin) return errorResponse!;

    try {
        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' };
        }

        const body = JSON.parse(event.body || '{}');
        const { user_id } = body;

        if (!user_id) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing user_id' }) };
        }

        // 1. Verify User exists in Cognito
        try {
            await cognito.send(new AdminGetUserCommand({
                UserPoolId: USER_POOL_ID,
                Username: user_id
            }));
        } catch (e: any) {
            if (e.name === 'UserNotFoundException') {
                return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'User not found in Cognito' }) };
            }
            throw e;
        }

        // 2. Create new shop
        const shopId = generateId();
        const now = new Date().toISOString();
        const shopName = "管理用ショップ";

        await ddb.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                PK: `SHOP#${shopId}`,
                SK: 'METADATA',
                name: shopName,
                owner_id: user_id,
                GSI2_PK: `USER#${user_id}`, // Legacy fallback support
                GSI2_SK: now,
                ts_created_at: now
            }
        }));

        // 3. Update/Create GENERAL_MANAGER record
        const userRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `USER#${user_id}`, SK: 'GENERAL_MANAGER' }
        }));

        if (userRes.Item) {
            // Already a GM, add to list if not present
            const currentShops = userRes.Item.shop_ids || [];
            if (!currentShops.includes(shopId)) {
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `USER#${user_id}`, SK: 'GENERAL_MANAGER' },
                    UpdateExpression: 'SET shop_ids = list_append(shop_ids, :new_sid)',
                    ExpressionAttributeValues: { ':new_sid': [shopId] }
                }));
            }
        } else {
            // Not a GM, create new GM record
            await ddb.send(new PutCommand({
                TableName: TABLE_NAME,
                Item: {
                    PK: `USER#${user_id}`,
                    SK: 'GENERAL_MANAGER',
                    shop_ids: [shopId],
                    ts_created_at: now
                }
            }));
        }

        return {
            statusCode: 201,
            headers: corsHeaders,
            body: JSON.stringify({ shop_id: shopId, message: 'Shop created and assigned to user as GENERAL_MANAGER' })
        };

    } catch (error: any) {
        console.error(error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: String(error) }) };
    }
};
