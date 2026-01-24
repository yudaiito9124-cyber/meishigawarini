
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,GET'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod !== 'GET') {
            return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' };
        }

        const uuid = event.pathParameters?.uuid;
        if (!uuid) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing UUID' }) };
        }

        const getRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: {
                PK: `QR#${uuid}`,
                SK: 'METADATA'
            }
        }));

        if (!getRes.Item) {
            return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Gift not found' }) };
        }

        const { status, product_id, shop_id, pin } = getRes.Item;

        // Fetch Product Data if available
        let product = null;
        if (shop_id && product_id) {
            const prodRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: {
                    PK: `SHOP#${shop_id}`,
                    SK: `PRODUCT#${product_id}`
                }
            }));
            product = prodRes.Item;
        }

        // Fallback for legacy or unlinked codes (Prototype safety)
        if (!product) {
            product = {
                name: 'Pending Gift',
                description: 'This gift has not been linked to a product yet.',
                image_url: 'https://placehold.co/600x400?text=Pending'
            };
        }

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                uuid,
                status,
                product_id,
                shop_id,
                pin,
                product
            })
        };

    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Internal Server Error' })
        };
    }
};
