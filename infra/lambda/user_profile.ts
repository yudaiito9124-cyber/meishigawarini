/**
 * 概要: ユーザープロフィールの取得・更新 (Cognito認証)
 * 詳細: ユーザー自身の「送り主情報」(Sender Info)を管理します。
 * エンドポイント:
 *  - POST /user/profile/get (プロフィールの取得)
 *  - POST /user/profile/update (プロフィールの更新)
 *  - POST /user/profile/uploadurl (アップロード用URLの取得)
 * リクエストボディ:
 *  - [update の場合]
 *  - profile: 更新するプロフィール情報オブジェクト (必須)
 *  - deleted_html_image_urls: 削除対象のHTML画像URLリスト (オプション)
 *  - [uploadurl の場合]
 *  - filename: ファイル名 (必須)
 *  - contentType: コンテンツタイプ (必須)
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { stripSignature, deleteFileByUrl, signUrlIfS3, signUrlsInHtml, stripSignaturesInHtml } from './utils/s3';
import { appendToHistory } from './utils/history';

const client = new DynamoDBClient({});
const s3Client = new S3Client({});
const ddb = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true,
        convertEmptyValues: true
    }
});
const TABLE_NAME = process.env.TABLE_NAME || '';
const BUCKET_NAME = process.env.BUCKET_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        // CORS プリフライトリクエストへの対応
        if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

        // Cognito Authorizer からユーザーIDを取得
        const authorizer = event.requestContext?.authorizer;
        const userId = authorizer?.principalId;
        if (!userId) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ message: 'Unauthorized' }) };
        }

        const body = JSON.parse(event.body || '{}');
        const resPath = event.resource;

        // アクションの判別
        let action = '';
        if (resPath.includes('/history')) {
            if (resPath.endsWith('/get')) action = 'history_get';
            else if (resPath.endsWith('/sendgift')) action = 'history_sendgift';
        } else {
            if (resPath.endsWith('/get')) action = 'get';
            else if (resPath.endsWith('/update')) action = 'update';
            else if (resPath.endsWith('/uploadurl')) action = 'uploadurl';
        }

        // ====================================================================
        // ACTION: get (プロフィールの取得)
        // ====================================================================
        if (action === 'get') {
            const pk = `USER#${userId}`;
            const sk = 'SENDER';

            // 【DB操作: GetItem】
            // - 目的: ログイン中のユーザーIDに紐づくプロフィール情報を取得
            // - テーブル: TABLE_NAME
            // - キー: { PK: `USER#${userId}`, SK: 'SENDER' }
            const getRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: pk, SK: sk }
            }));

            if (!getRes.Item) {
                return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ profile: null }) };
            }

            const profile = { ...getRes.Item };
            // PK, SK はレスポンスに含めない
            delete profile.PK;
            delete profile.SK;

            // S3画像に署名付きURLを付与（期限付きアクセスを許可）
            if (profile.card_image_url) {
                profile.card_image_url = await signUrlIfS3(profile.card_image_url, BUCKET_NAME);
            }
            if (profile.detail_html) {
                profile.detail_html = await signUrlsInHtml(profile.detail_html, BUCKET_NAME);
            }
            if (profile.html_image_urls && Array.isArray(profile.html_image_urls)) {
                profile.html_image_urls = await Promise.all(
                    profile.html_image_urls.map((url: string) => signUrlIfS3(url, BUCKET_NAME))
                );
            }

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ profile }) };
        }

        // ====================================================================
        // ACTION: update (プロフィールの更新)
        // ====================================================================
        if (action === 'update') {
            const { profile, deleted_html_image_urls } = body;
            if (!profile) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing profile data' }) };
            }

            const pk = `USER#${userId}`;
            const sk = 'SENDER';

            // 更新対象のキーを除去（セキュリティと整合性のため）
            const restrictedKeys = ['ts_created_at', 'ts_updated_at', 'PK', 'SK', 'import_id'];
            const keys = Object.keys(profile).filter(k => !restrictedKeys.includes(k));

            if (keys.length === 0) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'No valid fields to update' }) };
            }

            // S3 URL から署名パラメータを除去して保存用にクリーンアップ
            const cleanProfile = {
                ...profile,
                card_image_url: stripSignature(profile.card_image_url),
                html_image_urls: (profile.html_image_urls || []).map((url: string) => stripSignature(url)),
                detail_html: stripSignaturesInHtml(profile.detail_html, BUCKET_NAME)
            };

            // 【DB操作: UpdateItem】
            // - 目的: ユーザーのプロフィール情報を部分更新
            // - テーブル: TABLE_NAME
            // - キー: { PK: `USER#${userId}`, SK: 'SENDER' }
            // - 更新内容: ts_updated_at の更新と、提供された全フィールドの書き込み
            // - ReturnValues: 'ALL_OLD' (更新前の値を取得し、S3画像の削除判定に使用)
            const updateRes = await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: pk, SK: sk },
                UpdateExpression: 'SET #ts_up = :now, #ts_cr = if_not_exists(#ts_cr, :now), ' +
                    keys.map((_, i) => `#f${i} = :v${i}`).join(', '),
                ExpressionAttributeNames: {
                    '#ts_up': 'ts_updated_at',
                    '#ts_cr': 'ts_created_at',
                    ...keys.reduce((acc, k, i) => ({ ...acc, [`#f${i}`]: k }), {})
                },
                ExpressionAttributeValues: {
                    ':now': new Date().toISOString(),
                    ...keys.reduce((acc, k, i) => ({ ...acc, [`:v${i}`]: cleanProfile[k] }), {})
                },
                ReturnValues: 'ALL_OLD'
            }));

            // 不要になったS3画像の物理削除
            const oldImageUrl = updateRes.Attributes?.card_image_url;
            const newImageUrl = cleanProfile.card_image_url;
            if (oldImageUrl && oldImageUrl !== newImageUrl) {
                await deleteFileByUrl(oldImageUrl, BUCKET_NAME);
            }

            // HTMLアセット（画像）の削除
            const oldHtmlUrls = updateRes.Attributes?.html_image_urls || [];
            const newHtmlUrls = cleanProfile.html_image_urls || [];
            const toDelete = oldHtmlUrls.filter((url: string) => !newHtmlUrls.includes(url));
            for (const url of toDelete) {
                await deleteFileByUrl(url, BUCKET_NAME);
            }

            // 明示的に指定された削除リストの処理
            if (deleted_html_image_urls && Array.isArray(deleted_html_image_urls)) {
                for (const url of deleted_html_image_urls) {
                    const cleanUrl = stripSignature(url);
                    if (cleanUrl && !toDelete.includes(cleanUrl)) {
                        await deleteFileByUrl(cleanUrl, BUCKET_NAME);
                    }
                }
            }

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Profile updated successfully' }) };
        }

        // ====================================================================
        // ACTION: uploadurl (アップロード用URLの取得)
        // ====================================================================
        if (action === 'uploadurl') {
            const { filename, contentType } = body;
            if (!filename || !contentType) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing filename or contentType' }) };
            }

            // ファイルパスの設定 (ユーザーごとのプライベート空間)
            // 例: user/[userId]/profile/[timestamp]-[filename]
            const timestamp = Date.now();
            const key = `user/${userId}/profile/${timestamp}-${filename}`;

            // 【S3操作: GetSignedUrl (PutObject)】
            // - 目的: クライアントがブラウザから直接S3へファイルをアップロードするための署名付きURLを発行
            // - バケット: BUCKET_NAME
            // - キー: key
            // - 有効期限: 5分 (300秒)
            const command = new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: key,
                ContentType: contentType
            });

            const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
            const region = process.env.AWS_REGION || 'ap-northeast-1';
            const publicUrl = `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${key}`;

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({ uploadUrl, publicUrl })
            };
        }

        // ====================================================================
        // ACTION: history_get (送信履歴と受信履歴の取得)
        // ====================================================================
        if (action === 'history_get') {
            const pk = `USER#${userId}`;

            // SENDLOG と RECEIVEDLOG をまとめてQueryする (begins_with) は使えないので、それぞれのPrefixに対してQueryする。
            // 実際はメタデータとログエントリを取得。
            const fetchLogs = async (logType: string) => {
                const queryRes = await ddb.send(new QueryCommand({
                    TableName: TABLE_NAME,
                    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
                    ExpressionAttributeValues: {
                        ':pk': pk,
                        ':skPrefix': `${logType}#`
                    }
                }));
                const allUuids: Array<{ uuid: string, timestamp: string }> = [];
                for (const item of queryRes.Items || []) {
                    if (item.logs && Array.isArray(item.logs)) {
                        allUuids.push(...item.logs);
                    }
                }
                // Timestamp降順でソート
                allUuids.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                return allUuids;
            };

            const [sentUuids, receivedUuids] = await Promise.all([
                fetchLogs('SENDLOG'),
                fetchLogs('RECEIVEDLOG')
            ]);

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ sent: sentUuids, received: receivedUuids }) };
        }

        // ====================================================================
        // ACTION: history_sendgift (QRをスキャンして送信履歴に登録&紐付け)
        // ====================================================================
        if (action === 'history_sendgift') {
            const { uuid, pin } = body;
            if (!uuid || !pin) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing uuid or pin' }) };

            // 1. PINコード検証
            const getRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${uuid}`, SK: 'METADATA' }
            }));

            if (!getRes.Item || String(getRes.Item.pin) !== String(pin)) {
                return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid PIN or QR not found' }) };
            }

            // 2. CHATレコードに自分を送信者として紐付ける
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
                UpdateExpression: 'SET sender_id = :sid, ts_updated_at = :now',
                ExpressionAttributeValues: { ':sid': userId, ':now': new Date().toISOString() }
            }));

            // 3. SENDLOG に追記する
            await appendToHistory(ddb, TABLE_NAME, userId, 'SENDLOG', uuid);

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Gift successfully linked to your sender profile' }) };
        }

        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Unknown action' }) };

    } catch (error: any) {
        console.error('User profile handler error:', error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error' }) };
    }
};
