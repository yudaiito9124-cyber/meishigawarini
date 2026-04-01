/**
 * 概要: チャット添付用ファイルのアップロードURL生成
 * 詳細: 
 *  - 被贈答者によるチャット等でのファイル送信（画像等）を許可するため、S3の署名付きURL(PutObject)を発行します。
 *  - アップロード実行前に現時点での累計ファイルサイズ(total_size_bytes)を確認し、100MB制限を超えないかチェックします。
 *  - PIN認証に基づき、正当なユーザーのみがURLを取得できるように制御します。
 *
 * エンドポイント: POST /receive/upload-url
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { generateId } from './utils/id';
import { getPublicUrl } from './utils/s3';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME, BUCKET_NAME } from './share/db';
import { getUUID, getPIN } from './utils/request';

const s3 = new S3Client({});
const CAPACITY_LIMIT_MB = 100;

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}');
        const uuid = getUUID(event, body);
        const pin = getPIN(event, body);
        const { filename, contentType, fileSize } = body;
        
        if (!uuid || !pin || !filename) return errorResponse(400, 'Missing required fields');

        // 【DB操作: GetItem】
        // 理由: QRコードのメタデータを取得し、PINの一致とステータスを検証。
        const qrRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME, Key: { PK: `QR#${uuid}`, SK: 'METADATA' }
        }));

        if (!qrRes.Item || String(qrRes.Item.pin) !== String(pin)) {
            return errorResponse(403, 'Unauthorized');
        }

        // チャット容量制限のチェック (SK=CHATに蓄積された累計サイズを確認)
        const chatRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME, Key: { PK: `QR#${uuid}`, SK: 'CHAT' }
        }));
        const currentTotalSize = chatRes.Item?.total_size_bytes || 0;
        const requestedSize = Number(fileSize) || 0;

        if (currentTotalSize + requestedSize > CAPACITY_LIMIT_MB * 1024 * 1024) {
            return errorResponse(403, `Capacity limit exceeded. Max ${CAPACITY_LIMIT_MB}MB.`);
        }

        const id = generateId();
        const ext = filename.split('.').pop() || 'bin';
        const key = `qrcode/${uuid}/chat/${id}.${ext}`;

        // S3 PutObject 署名付きURLの生成 (有効期限: 1時間)
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            ContentType: contentType || 'application/octet-stream'
        });
        const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        const finalUrl = getPublicUrl(BUCKET_NAME, key);

        return successResponse({
            uploadUrl,
            key,
            fileUrl: finalUrl
        });

    } catch (error: any) {
        console.error('Receive upload-url error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
