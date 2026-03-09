
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const s3 = new S3Client({});

const TABLE_NAME = process.env.TABLE_NAME || '';
const BUCKET_NAME = process.env.BUCKET_NAME || '';
const MAX_TOTAL_SIZE_MB = 100;
const MAX_TOTAL_SIZE_BYTES = MAX_TOTAL_SIZE_MB * 1024 * 1024;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        const { uuid } = event.pathParameters || {};
        if (!uuid) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing UUID' }) };
        }

        const pin = event.queryStringParameters?.pin;
        if (!pin) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing PIN' }) };
        }

        const contentType = event.queryStringParameters?.contentType;
        if (!contentType) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing contentType' }) };
        }

        const fileSizeStr = event.queryStringParameters?.fileSize;
        if (!fileSizeStr) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing fileSize' }) };
        }
        const fileSize = parseInt(fileSizeStr);

        const filename = event.queryStringParameters?.filename || 'unnamed';

        // 1. Verify PIN and Check Capacity
        const getMeta = await ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${uuid}`, SK: 'METADATA' }
        }));

        if (!getMeta.Item) {
            return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'QR Code not found' }) };
        }

        if (getMeta.Item.pin !== pin) {
            return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid PIN' }) };
        }

        // 2. Check Capacity from SK: CHAT
        const getChat = await ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${uuid}`, SK: 'CHAT' }
        }));

        const totalSizeBytes = getChat.Item?.total_size_bytes || 0;
        if (totalSizeBytes + fileSize > MAX_TOTAL_SIZE_BYTES) {
            return {
                statusCode: 403,
                headers: corsHeaders,
                body: JSON.stringify({
                    message: `Capacity limit exceeded. Max: ${MAX_TOTAL_SIZE_MB}MB. Current: ${(totalSizeBytes / 1024 / 1024).toFixed(2)}MB`
                })
            };
        }

        // 3. Generate Naming Convention: chat/{uuid}/{YYYYMMDD-HHMMSS}_{hash}.{ext}
        const now = new Date();
        const dateStr = now.toISOString().replace(/[:T]/g, '-').split('.')[0].replace(/-/g, '').slice(0, 8) + '-' + now.toISOString().split('T')[1].split('.')[0].replace(/:/g, '');
        const hash = crypto.randomBytes(4).toString('hex');
        const ext = filename.split('.').pop() || 'bin';
        const key = `qrcode/${uuid}/${dateStr}_${hash}.${ext}`;

        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            ContentType: contentType
        });

        const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
        const region = process.env.AWS_REGION || 'ap-northeast-1';
        const publicUrl = `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${key}`;

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ uploadUrl, publicUrl, key })
        };

    } catch (error: any) {
        console.error(error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Internal Server Error' })
        };
    }
};
