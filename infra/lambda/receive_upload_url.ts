/**
 * 概要: チャット添付用画像アップロード用URLの発行
 * 詳細: チャットに画像を添付するための署名付きURL（Presigned URL）を発行します。チャット容量制限のチェックも行います。
 * エンドポイント: POST /receive/upload-url
 * リクエストボディ:
 *  - contentType: ファイルのMIMEタイプ (例: image/jpeg) (必須)
 *  - fileSize: ファイルサイズ (byte) (必須)
 *  - filename: 元のファイル名 (必須)
 *  - folder: 格納先フォルダ (デフォルト: 'chat') (オプション)
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { generateId } from './utils/id';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const s3 = new S3Client({});
const TABLE_NAME = process.env.TABLE_NAME || '';
const BUCKET_NAME = process.env.BUCKET_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,GET,POST'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

        const uuid = event.requestContext.authorizer?.uuid || event.headers['X-QR-UUID'] || event.headers['x-qr-uuid'];
        const pin = event.requestContext.authorizer?.pin || event.headers['X-QR-PIN'] || event.headers['x-qr-pin'];
        
        if (!uuid || !pin) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing UUID or PIN' }) };
        }

        // 【DB操作: GetItem】
        // - 目的: アップロード実行前に利用者のバリデーション（PIN一致確認）を行う
        // - テーブル: TABLE_NAME
        // - リクエストキー: { PK: `QR#${uuid}`, SK: 'METADATA' }
        const getRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `QR#${uuid}`, SK: 'METADATA' } }));
        if (!getRes.Item || String(getRes.Item.pin) !== String(pin)) {
            return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'Unauthorized' }) };
        }

        const body = event.body ? JSON.parse(event.body) : {};
        const contentType = body.contentType || event.queryStringParameters?.contentType || 'image/jpeg';
        const fileSize = body.fileSize || parseInt(event.queryStringParameters?.fileSize || '0');
        const filename = body.filename || event.queryStringParameters?.filename || 'unnamed';
        const folder = body.folder || event.queryStringParameters?.folder || 'chat';

        // 【DB操作: GetItem】
        // - 目的: チャット全体の累計アップロードサイズを確認し、100MB制限を超えないかチェック
        // - テーブル: TABLE_NAME
        // - リクエストキー: { PK: `QR#${uuid}`, SK: 'CHAT' }
        const getChat = await ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${uuid}`, SK: 'CHAT' }
        }));

        const MAX_TOTAL_SIZE_MB = 100;
        const MAX_TOTAL_SIZE_BYTES = MAX_TOTAL_SIZE_MB * 1024 * 1024;
        const totalSizeBytes = getChat.Item?.total_size_bytes || 0;

        if (totalSizeBytes + fileSize > MAX_TOTAL_SIZE_BYTES) {
            return {
                statusCode: 403,
                headers: corsHeaders,
                body: JSON.stringify({
                    message: 'Capacity limit exceeded',
                    detail: `Max: ${MAX_TOTAL_SIZE_MB}MB. Current: ${(totalSizeBytes / 1024 / 1024).toFixed(2)}MB`
                })
            };
        }

        const id = generateId();
        const ext = filename.split('.').pop() || (contentType.split('/')[1] || 'bin');
        const key = `qrcode/${uuid}/${folder}/${id}.${ext}`;

        // S3 署名付きURLの生成 (書き込み用)
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            ContentType: contentType,
        });

        const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        const region = process.env.AWS_REGION || 'ap-northeast-1';
        const publicUrl = `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${key}`;

        // フロントエンドでの即時プレビュー用に署名を付与 (読み取り用)
        const { signUrlIfS3 } = await import('./utils/s3.js');
        const signedPublicUrl = await signUrlIfS3(publicUrl, BUCKET_NAME);

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                uploadUrl,
                publicUrl: signedPublicUrl,
                fileUrl: publicUrl, // 両方返しておく
                key
            })
        };

    } catch (error: any) {
        console.error(error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error' }) };
    }
};
