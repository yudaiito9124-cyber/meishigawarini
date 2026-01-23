
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

        const { status, product_id, pin } = getRes.Item;

        // Mock Product Data for Prototype
        const products: Record<string, any> = {
            'prod-1': {
                name: 'Premium Sake Set',
                description: 'A curated selection of the finest sake from Japan. Enjoy the rich aroma and smooth taste.',
                image_url: 'https://placehold.co/600x400?text=Sake+Set'
            },
            'prod-2': {
                name: 'Matcha Cookies',
                description: 'Delicate cookies made with high-quality Matcha powder. Perfect for tea time.',
                image_url: 'https://placehold.co/600x400?text=Matcha+Cookies'
            },
            'prod-3': {
                name: 'Pottery Vase',
                description: 'Handcrafted pottery vase. A beautiful piece of art for your home.',
                image_url: 'https://placehold.co/600x400?text=Pottery+Vase'
            }
        };

        const product = products[product_id] || {
            name: 'Special Gift',
            description: 'A special surprise gift curated just for you.',
            image_url: 'https://placehold.co/600x400?text=Special+Gift'
        };

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                uuid,
                status,
                product_id,
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
