import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { generateId } from './utils/id';
import { stripSignature, signUrlIfS3, localizeS3Image, deleteFolderFromS3, getPresignedViewUrl } from './utils/s3';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const s3 = new S3Client({});

const TABLE_NAME = process.env.TABLE_NAME || '';
const BUCKET_NAME = process.env.BUCKET_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,GET,PATCH,DELETE'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        const path = event.path;
        const method = event.httpMethod;
        const designId = event.pathParameters?.id;

        // 1. List All Designs (GET /admin/card-designs)
        if (method === 'GET' && !designId) {
            const res = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: 'PK = :pk',
                ExpressionAttributeValues: {
                    ':pk': 'CARD_DESIGN#METADATA'
                }
            }));
            const items = res.Items || [];

            // Sign URLs for preview
            for (const item of items) {
                if (item.bgimgf) item.bgimgf = await signUrlIfS3(item.bgimgf, BUCKET_NAME);
                if (item.bgimgb) item.bgimgb = await signUrlIfS3(item.bgimgb, BUCKET_NAME);
                if (item.thumbf) item.thumbf = await signUrlIfS3(item.thumbf, BUCKET_NAME);
                if (item.thumbb) item.thumbb = await signUrlIfS3(item.thumbb, BUCKET_NAME);
            }

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ items }) };
        }

        // 2. Create Design (POST /admin/card-designs)
        if (method === 'POST' && !designId && !path.endsWith('/upload-url')) {
            const body = JSON.parse(event.body || '{}');
            const newId = body.design_id || generateId();
            const now = new Date().toISOString();

            const item = {
                ...body,
                PK: 'CARD_DESIGN#METADATA',
                SK: newId,
                design_id: newId,
                ts_created_at: now,
                ts_updated_at: now
            };

            // Clean signatures and localize images to standardized paths
            if (item.bgimgf) item.bgimgf = await localizeS3Image(item.bgimgf, BUCKET_NAME, newId, 'front');
            if (item.bgimgb) item.bgimgb = await localizeS3Image(item.bgimgb, BUCKET_NAME, newId, 'back');
            if (item.thumbf) item.thumbf = await localizeS3Image(item.thumbf, BUCKET_NAME, newId, 'thumbf');
            if (item.thumbb) item.thumbb = await localizeS3Image(item.thumbb, BUCKET_NAME, newId, 'thumbb');

            try {
                await ddb.send(new PutCommand({
                    TableName: TABLE_NAME,
                    Item: item
                }));
            } catch (err: any) {
                console.error("DynamoDB Put Error:", err);
                return { 
                    statusCode: 500, 
                    headers: corsHeaders, 
                    body: JSON.stringify({ message: 'Database creation failed', error: err.message }) 
                };
            }

            return { statusCode: 201, headers: corsHeaders, body: JSON.stringify({ design_id: newId, message: 'Design created' }) };
        }

        // 3. Get Upload URL (POST /admin/card-designs/upload-url)
        if (method === 'POST' && path.endsWith('/upload-url')) {
            const body = JSON.parse(event.body || '{}');
            const { filename, contentType, design_id } = body;
            if (!filename || !contentType || !design_id) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing params' }) };
            }

            const tempId = generateId();
            const key = `temp/card-designs/${design_id}/${tempId}_${filename}`;
            const command = new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: key,
                ContentType: contentType
            });

            const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
            
            // Also get a signed VIEW URL so the frontend can show it immediately
            const signedViewUrl = await getPresignedViewUrl(BUCKET_NAME, key, 3600);

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ uploadUrl, publicUrl: signedViewUrl }) };
        }

        if (!designId) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing design ID' }) };
        }

        // 4. Update Design (PATCH /admin/card-designs/{id})
        if (method === 'PATCH') {
            const body = JSON.parse(event.body || '{}');
            const now = new Date().toISOString();

            // Localize images and strip signatures
            if (body.bgimgf) body.bgimgf = await localizeS3Image(body.bgimgf, BUCKET_NAME, designId, 'front');
            if (body.bgimgb) body.bgimgb = await localizeS3Image(body.bgimgb, BUCKET_NAME, designId, 'back');
            if (body.thumbf) body.thumbf = await localizeS3Image(body.thumbf, BUCKET_NAME, designId, 'thumbf');
            if (body.thumbb) body.thumbb = await localizeS3Image(body.thumbb, BUCKET_NAME, designId, 'thumbb');

            const updateExprParts: string[] = [];
            const attrValues: any = { ':now': now };
            const attrNames: any = {};

            Object.entries(body).forEach(([key, value]) => {
                if (['PK', 'SK', 'design_id', 'ts_created_at', 'ts_updated_at'].includes(key)) return;
                if (value === undefined) return;
                const attrKey = `#${key}`;
                const valKey = `:${key}`;
                updateExprParts.push(`${attrKey} = ${valKey}`);
                attrNames[attrKey] = key;
                attrValues[valKey] = value === "" ? null : value; // Convert empty strings to null for DynamoDB safety
            });

            attrNames['#ts_updated_at'] = 'ts_updated_at';
            
            try {
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: 'CARD_DESIGN#METADATA', SK: designId },
                    UpdateExpression: `SET ${updateExprParts.length > 0 ? updateExprParts.join(', ') + ', ' : ''} #ts_updated_at = :now`,
                    ExpressionAttributeNames: attrNames,
                    ExpressionAttributeValues: attrValues
                }));
            } catch (err: any) {
                console.error("DynamoDB Update Error:", err);
                return { 
                    statusCode: 500, 
                    headers: corsHeaders, 
                    body: JSON.stringify({ message: 'Database update failed', error: err.message, details: err.stack }) 
                };
            }

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Design updated' }) };
        }

        // 5. Delete Design (DELETE /admin/card-designs/{id})
        if (method === 'DELETE') {
            await ddb.send(new DeleteCommand({
                TableName: TABLE_NAME,
                Key: { PK: 'CARD_DESIGN#METADATA', SK: designId }
            }));

            // Recursive S3 deletion of the design folder
            await deleteFolderFromS3(BUCKET_NAME, `admin/card-designs/${designId}/`);

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Design deleted' }) };
        }

        return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };

    } catch (error: any) {
        console.error(error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Internal Server Error', error: error.message })
        };
    }
};
