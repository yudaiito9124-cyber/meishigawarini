/**
 * @file user_profile.ts
 * @role ユーザー用：プロフィール（送り主情報）管理ハンドラー
 * @responsibility
 *  - ギフトを贈る側の「自分（送り主）」情報を管理します。この情報は QR スキャン後のメッセージ画面等で表示される重要なデータです。
 *  - 【アセット・ライフサイクル】
 *    - `get`: 保存された S3 パスを署名付き URL に変換し、セキュアな閲覧を可能にします。
 *    - `update`: プロフィール画像（`card_image_url`）や詳細内の画像を差し替えた際、古いファイルを S3 から物理削除（Storage Cleanup）します。
 *    - `uploadurl`: クライアントが重いバイナリ（画像）を Lambda 経由せず直接 S3 に送れるよう、書き込み用の一時署名付き URL を発行します。
 *  - 【互換性・動的更新】
 *    - 過去のフロントエンド実装との互換性を保つため、キャメルケースのフィールド名をスネークケースへ自動マッピングします。
 *    - `UpdateExpression` を動的に構築することで、プロフィールの部分更新を汎用的に行えるようにしています。
 * @context
 *  - Cognito Authorizer と連携し、自身の `userId` に紐付くデータのみを安全に編集できる設計になっています。
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
import { getQrId, getPIN, getShopId, getAction, getUserId } from './utils/request';
import { UserApiSchema } from '@shared/api-types';

const s3Client = new S3Client({});

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}');
        const userId = getUserId(event);
        const action = getAction(event, body);
        
        if (!userId) return errorResponse(401, 'Unauthorized');

        /**
         * プロフィールレコード内の各種 S3 パスに対し、ブラウザ表示用の署名（URL）を付与する内部関数。
         */
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

        // --------------------------------------------------------------------
        // ACTION: get (プロフィールの取得)
        // --------------------------------------------------------------------
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
        }

        // --------------------------------------------------------------------
        // ACTION: update (プロフィールの更新とアセット掃除)
        // --------------------------------------------------------------------
        if (action === 'update') {
            const { profile: profile_input, deleted_html_image_urls } = body as UserApiSchema['user_profile_update'];
            if (!profile_input) return errorResponse(400, 'Missing profile data');

            // 後方互換性マッピング: camelCase パラメータを DB 用の snake_case へ内部変換
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

            const restrictedKeys = ['ts_created_at', 'ts_updated_at', 'PK', 'SK', 'user_id'];
            const keys = Object.keys(profile).filter(k => !restrictedKeys.includes(k));

            if (keys.length === 0) return errorResponse(400, 'No valid fields to update');

            // 保存用のデータクリーンアップ（署名なしパスへの変換）
            const cleanProfile = {
                ...profile,
                card_image_url: stripSignature(profile.card_image_url),
                html_image_urls: (profile.html_image_urls || []).map((url: string) => stripSignature(url)),
                detail_html: stripSignaturesInHtml(profile.detail_html, BUCKET_NAME)
            };

            // 動的な UpdateExpression の構築
            const updateRes = await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `USER#${userId}`, SK: 'SENDER' },
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
                ReturnValues: 'ALL_OLD' // 以前の画像 URL を特定するために古い値を参照
            }));

            // 【物理削除】古いプロフィール画像が不要になった場合に削除
            const oldImageUrl = updateRes.Attributes?.card_image_url;
            const newImageUrl = cleanProfile.card_image_url;
            if (oldImageUrl && oldImageUrl !== newImageUrl) {
                await deleteFileByUrl(oldImageUrl, BUCKET_NAME);
            }

            // 【物理削除】HTML コンテンツから削除された画像を削除
            const oldHtmlUrls = updateRes.Attributes?.html_image_urls || [];
            const newHtmlUrls = cleanProfile.html_image_urls || [];
            const toDelete = oldHtmlUrls.filter((url: string) => !newHtmlUrls.includes(url));
            for (const url of toDelete) {
                await deleteFileByUrl(url, BUCKET_NAME);
            }

            // クライアントからの明示的な削除要求への対応
            if (deleted_html_image_urls && Array.isArray(deleted_html_image_urls)) {
                for (const url of deleted_html_image_urls) {
                    const cleanUrl = stripSignature(url);
                    if (cleanUrl && !toDelete.includes(cleanUrl)) {
                        await deleteFileByUrl(cleanUrl, BUCKET_NAME);
                    }
                }
            }

            // 更新後の最新状態を署名付き URL で再取得して返却
            const finalProfileRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `USER#${userId}`, SK: 'SENDER' }
            }));
            const finalProfile = await signProfile(finalProfileRes.Item);

            return successResponse({ message: 'Profile updated successfully', profile: finalProfile });
        }

        // --------------------------------------------------------------------
        // ACTION: uploadurl (アップロード用 URL の発行)
        // --------------------------------------------------------------------
        if (action === 'uploadurl') {
            const { filename, content_type } = body as UserApiSchema['user_profile_uploadurl'];
            if (!filename || !content_type) return errorResponse(400, 'Missing filename or content_type');

            // ユーザー毎のプレフィックスを付けてパスを衝突防止
            const timestamp = Date.now();
            const key = `user/${userId}/profile/${timestamp}-${filename}`;

            const command = new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: key,
                ContentType: content_type
            });

            // 5 分間有効なアップロード用 URL を発行
            const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
            const region = process.env.AWS_REGION || 'ap-northeast-1';
            const rawPublicUrl = `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${key}`;
            const publicUrl = await signUrlIfS3(rawPublicUrl, BUCKET_NAME); // 表示確認用も併せて返却
            
            return successResponse({ uploadUrl, publicUrl });
        }

        return errorResponse(404, 'Unknown action');

    } catch (error: any) {
        console.error('User profile handler error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
