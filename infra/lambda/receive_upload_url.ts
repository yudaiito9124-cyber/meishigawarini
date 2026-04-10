/**
 * @file receive_upload_url.ts
 * @role ゲスト用：チャット添付用 S3 アップロード URL 生成ハンドラー
 * @responsibility
 *  - 受取人がチャットメッセージに画像や資料を添付できるように、S3 の署名付き URL（Presigned URL）を発行します。
 *  - 【アップロード前クォータ検証】
 *    - 署名を発行する前に `CHAT` レコードの `total_size_bytes` を取得し、今回申請されたファイルサイズを加算してもギフトごとの上限（100MB）を超えないか、厳格にチェックします。
 *  - 【セキュアなパス設計】
 *    - テンプレート：`qrcode/{qr_id}/chat/{id}.{ext}`
 *    - QR ID ごとにディレクトリを分離し、さらにメッセージ個別の ID を付与することで、アセットの衝突と不正アクセスを防ぎます。
 * @context
 *  - サーバーを介さず直接 S3 へアップロードするフロントエンド処理の窓口となります。
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { generateId } from './utils/id';
import { getPublicUrl } from './utils/s3';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME, BUCKET_NAME } from './share/db';
import { getQrId, getPIN } from './utils/request';
import { ReceiveApiSchema } from '@shared/api-types';

const s3 = new S3Client({});
/** チャットごとの累計ストレージ上限（100MB） */
const CAPACITY_LIMIT_MB = 100;

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}') as ReceiveApiSchema['receive_uploadurl_get'];
        const qr_id = getQrId(event, body);
        const pin = getPIN(event, body);
        const { filename, content_type, file_size } = body;
        
        if (!qr_id || !pin || !filename) return errorResponse(400, 'Missing required fields');

        // 1. PIN 認証と基本妥当性チェック
        const qrRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' }
        }));

        if (!qrRes.Item || String(qrRes.Item.pin) !== String(pin)) {
            return errorResponse(403, 'Unauthorized');
        }

        // 2. チャット容量制限のチェック (SK=CHAT に記録されている累計サイズを確認)
        const chatRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'CHAT' }
        }));
        const currentTotalSize = chatRes.Item?.total_size_bytes || 0;
        const requestedSize = Number(file_size) || 0;

        if (currentTotalSize + requestedSize > CAPACITY_LIMIT_MB * 1024 * 1024) {
            return errorResponse(403, `Capacity limit exceeded. Max ${CAPACITY_LIMIT_MB}MB.`);
        }

        // 3. パス生成と署名発行
        const id = generateId();
        const ext = filename.split('.').pop() || 'bin';
        const key = `qrcode/${qr_id}/chat/${id}.${ext}`;

        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            ContentType: content_type || 'application/octet-stream'
        });

        // 1時間有効な Presigned URL を発行
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
