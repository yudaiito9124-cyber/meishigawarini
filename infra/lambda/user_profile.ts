/**
 * 概要: ユーザープロフィールの取得・更新 (Cognito認証)
 * 詳細:
 *  - ユーザー自身の「送り主情報」(Sender Info)を管理します。
 *  - 送り主情報はDynamoDBに保存され、チャット画面（QRスキャン後）でカードデザインとともに表示される中核的なデータです。
 *  - プロフィールには属性情報、プロフィール画像(card_image_url)、自由記述HTML(detail_html)、およびアセット画像(html_image_urls)が含まれます。
 *  - S3上の画像については、保存時は署名なしのURL、取得時は署名付きのURL(Presigned URL)として扱うよう制御します。
 *
 * エンドポイント:
 *  - POST /user/profile/get (ログインユーザーのプロフィールを取得)
 *  - POST /user/profile/update (ログインユーザーのプロフィールを更新・保存)
 *  - POST /user/profile/uploadurl (プロフィール画像等アップロード用の署名付きURLを取得)
 *
 * リクエストボディ (共通項目):
 *  - action: "get" | "update" | "uploadurl" (リソースパスに基づく自動判別もサポート)
 *
 * セキュリティ:
 *  - Cognito Authorizerにより、リクエストを送信した本人のデータのみにアクセスできるよう制限されます。
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand, UpdateCommand, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { stripSignature, deleteFileByUrl, signUrlIfS3, signUrlsInHtml, stripSignaturesInHtml } from './utils/s3';
import { getSystemDesign } from './utils/designs';
import { appendToHistory } from './utils/history';
import { apiResponse, successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME, BUCKET_NAME, USER_POOL_ID } from './share/db';
import { getUUID, getPIN, getShopId, getAction, getUserId } from './utils/request';

const s3Client = new S3Client({});

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}');
        const userId = getUserId(event);
        const action = getAction(event, body);
        
        if (!userId) return errorResponse(401, 'Unauthorized');

        const signProfile = async (profile: any) => {
            const signed = { ...profile };
            delete signed.PK;
            delete signed.SK;

            if (signed.card_image_url) {
                signed.card_image_url = await signUrlIfS3(signed.card_image_url, BUCKET_NAME);
            }
            if (signed.detail_html) {
                signed.detail_html = await signUrlsInHtml(signed.detail_html, BUCKET_NAME);
            }
            if (signed.html_image_urls && Array.isArray(signed.html_image_urls)) {
                signed.html_image_urls = await Promise.all(
                    signed.html_image_urls.map((url: string) => signUrlIfS3(url, BUCKET_NAME))
                );
            }
            return signed;
        };

        // ====================================================================
        // ACTION: get (プロフィールの取得)
        // --------------------------------------------------------------------
        // 目的: ログイン中のユーザーIDに紐づく「送り主」(SENDER) プロフィール情報を取得します。
        // S3上の画像データについては、フロントエンドから参照可能な「署名付きURL」に変換して返却します。
        // ====================================================================
        if (action === 'get') {
            const pk = `USER#${userId}`;
            const sk = 'SENDER';

            const getRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: pk, SK: sk }
            }));

            if (!getRes.Item) {
                return successResponse({ profile: null, user_id: userId });
            }

            const profile = await signProfile(getRes.Item);
            return successResponse({ profile, user_id: userId });

            return successResponse({ profile, user_id: userId });
        }

        // ====================================================================
        // ACTION: update (プロフィールの更新)
        // --------------------------------------------------------------------
        // 目的: ユーザーの「送り主」(SENDER) プロフィール情報を保存・部分更新。
        // ====================================================================
        if (action === 'update') {
            const profile_input = body.senderInfo || body.profile;
            const deleted_html_image_urls = body.deletedHtmlImageUrls || body.deleted_html_image_urls;
            if (!profile_input) return errorResponse(400, 'Missing profile data');

            // 後方互換性のため camelCase を snake_case にマッピング
            const profile: any = { ...profile_input };
            const mapping: { [key: string]: string } = {
                cardImageUrl: 'card_image_url',
                cardImageName: 'card_image_name',
                detailHtml: 'detail_html',
                jobTitle: 'job_title'
            };
            Object.keys(mapping).forEach(camel => {
                if (profile[camel] && !profile[mapping[camel]]) {
                    profile[mapping[camel]] = profile[camel];
                    delete profile[camel];
                }
            });

            const pk = `USER#${userId}`;
            const sk = 'SENDER';

            const restrictedKeys = ['ts_created_at', 'ts_updated_at', 'PK', 'SK', 'user_id'];
            const keys = Object.keys(profile).filter(k => !restrictedKeys.includes(k));

            if (keys.length === 0) return errorResponse(400, 'No valid fields to update');

            const cleanProfile = {
                ...profile,
                card_image_url: stripSignature(profile.card_image_url),
                html_image_urls: (profile.html_image_urls || []).map((url: string) => stripSignature(url)),
                detail_html: stripSignaturesInHtml(profile.detail_html, BUCKET_NAME)
            };

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

            // 不要画像の物理削除
            const oldImageUrl = updateRes.Attributes?.card_image_url;
            const newImageUrl = cleanProfile.card_image_url;
            if (oldImageUrl && oldImageUrl !== newImageUrl) {
                await deleteFileByUrl(oldImageUrl, BUCKET_NAME);
            }

            const oldHtmlUrls = updateRes.Attributes?.html_image_urls || [];
            const newHtmlUrls = cleanProfile.html_image_urls || [];
            const toDelete = oldHtmlUrls.filter((url: string) => !newHtmlUrls.includes(url));
            for (const url of toDelete) {
                await deleteFileByUrl(url, BUCKET_NAME);
            }

            if (deleted_html_image_urls && Array.isArray(deleted_html_image_urls)) {
                for (const url of deleted_html_image_urls) {
                    const cleanUrl = stripSignature(url);
                    if (cleanUrl && !toDelete.includes(cleanUrl)) {
                        await deleteFileByUrl(cleanUrl, BUCKET_NAME);
                    }
                }
            }

            const finalProfileRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: pk, SK: sk }
            }));
            const finalProfile = await signProfile(finalProfileRes.Item);

            return successResponse({ message: 'Profile updated successfully', profile: finalProfile });
        }

        // ====================================================================
        // ACTION: uploadurl (アップロード用URLの取得)
        // --------------------------------------------------------------------
        // 目的: ブラウザから直接S3へファイルをアップロードするための署名付きURLを発行
        // ====================================================================
        if (action === 'uploadurl') {
            const { filename } = body;
            const content_type = body.content_type || body.contentType;
            if (!filename || !content_type) return errorResponse(400, 'Missing filename or content_type');

            const timestamp = Date.now();
            const key = `user/${userId}/profile/${timestamp}-${filename}`;

            const command = new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: key,
                ContentType: content_type
            });

            const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
            const region = process.env.AWS_REGION || 'ap-northeast-1';
            const rawPublicUrl = `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${key}`;
            const publicUrl = await signUrlIfS3(rawPublicUrl, BUCKET_NAME);
            
            return successResponse({ uploadUrl, publicUrl });
        }

        return errorResponse(404, 'Unknown action');

    } catch (error: any) {
        console.error('User profile handler error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
