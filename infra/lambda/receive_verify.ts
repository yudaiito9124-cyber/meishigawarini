/**
 * 概要: ギフト受取開始時の認証と情報取得
 * 詳細: 
 *  - 被贈答者がスキャンしたQRコードのPIN認証を行い、ギフトの現在のステータスを確認します。
 *  - レートリミット（失敗回数制限）およびパスワード保護の検証を行います。
 *  - 期限切れの遅延評価（Lazy Expiration）を実施し、必要に応じてステータスを更新します。
 *  - 認証成功時、関連するショップ情報、商品情報、デザイン情報の他、発送済みであれば追跡情報も一括取得します。
 *
 * エンドポイント: POST /receive/verify
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand, UpdateCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import * as bcrypt from 'bcryptjs';
import { isLocked, getRateLimitUpdate, getResetRateLimitUpdate } from './utils/rate-limit';
import { signUrlIfS3, signUrlsInHtml } from './utils/s3';
import { getSystemDesign } from './utils/designs';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME, BUCKET_NAME } from './share/db';

const cognito = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID || '';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();
        if (event.httpMethod !== 'POST') return errorResponse(405, 'Method Not Allowed');

        const body = JSON.parse(event.body || '{}');
        const { uuid, pin, password } = body;
        
        if (!uuid || !pin) return errorResponse(400, 'Missing uuid or pin');

        // 【確認フェーズ 1: QRコードの存在と状態確認】
        const qrRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME, Key: { PK: `QR#${uuid}`, SK: 'METADATA' }
        }));
        if (!qrRes.Item) return errorResponse(404, 'Invalid Gift or PIN');

        const item = qrRes.Item;

        // 【確認フェーズ 2: レートリミット管理】
        if (isLocked(item)) return errorResponse(403, 'Too many attempts. QR is currently locked.');

        // PIN認証
        if (String(item.pin) !== String(pin)) {
            const { UpdateExpression, ExpressionAttributeValues, ExpressionAttributeNames } = getRateLimitUpdate(item);
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME, Key: { PK: `QR#${uuid}`, SK: 'METADATA' },
                UpdateExpression, ExpressionAttributeValues, ExpressionAttributeNames
            }));
            return errorResponse(400, 'Invalid Gift or PIN');
        }

        // 成功時にカウンタリセット
        if (item.failed_attempts || item.locked_until) {
            const { UpdateExpression, ExpressionAttributeNames } = getResetRateLimitUpdate();
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME, Key: { PK: `QR#${uuid}`, SK: 'METADATA' },
                UpdateExpression, ExpressionAttributeNames
            })).catch(e => console.error("Rate limit reset failed", e));
        }

        // 【確認フェーズ 3: パスワード保護の検証】
        let isAuthorizedByPassword = true;
        let isPasswordProtected = false;
        if (item.password_hash) {
            isPasswordProtected = true;
            if (password) {
                isAuthorizedByPassword = await bcrypt.compare(password, item.password_hash);
            } else {
                isAuthorizedByPassword = false;
            }
        }

        let status = item.status;
        const now = new Date();

        // 【確認フェーズ 4: 期限切れチェック (遅延評価)】
        if (status === 'ACTIVE' && item.ts_expired_at && now > new Date(item.ts_expired_at)) {
            status = 'EXPIRED';
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME, Key: { PK: `QR#${uuid}`, SK: 'METADATA' },
                UpdateExpression: 'SET #status = :expired, GSI1_PK = :gsi_pk, ts_updated_at = :now',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: { ':expired': 'EXPIRED', ':gsi_pk': 'QR#EXPIRED', ':now': now.toISOString() }
            })).catch(e => console.error('Failed lazy expire update', e));
        }

        // 基本的な受取可能チェック
        if (!['ACTIVE', 'USED', 'SHIPPED', 'COMPLETED'].includes(status)) {
            return errorResponse(410, 'Gift is not in an active state');
        }

        // ====================================================================
        // 情報の紐付け (実施フェーズ / Enrichment)
        // ====================================================================
        const shopId = item.shop_id;
        const productId = item.product_id;
        const designId = item.card_design;

        const keys = [];
        if (shopId) keys.push({ PK: `SHOP#${shopId}`, SK: 'METADATA' });
        if (shopId && productId) keys.push({ PK: `SHOP#${shopId}`, SK: `PRODUCT#${productId}` });
        if (designId) keys.push({ PK: 'CARD_DESIGN#METADATA', SK: designId });
        if (isAuthorizedByPassword && status === 'SHIPPED') keys.push({ PK: `QR#${uuid}`, SK: 'ORDER' });

        const batchRes = await ddb.send(new BatchGetCommand({
            RequestItems: { [TABLE_NAME]: { Keys: keys } }
        }));
        const responses = batchRes.Responses?.[TABLE_NAME] || [];

        const shop = responses.find(r => r.PK === `SHOP#${shopId}` && r.SK === 'METADATA');
        const product = responses.find(r => r.PK === `SHOP#${shopId}` && r.SK === `PRODUCT#${productId}`);
        const designMeta = responses.find(r => r.PK === 'CARD_DESIGN#METADATA' && r.SK === designId);
        const design = designMeta || getSystemDesign(designId);
        const order = responses.find(r => r.PK === `QR#${uuid}` && r.SK === 'ORDER');

        // ショップオーナーのEmailフォールバック (Cognito)
        let shopEmail = shop?.email;
        if (!shopEmail && shop?.owner_id && USER_POOL_ID) {
            const user = await cognito.send(new AdminGetUserCommand({ 
                UserPoolId: USER_POOL_ID, Username: shop.owner_id 
            })).catch(() => null);
            shopEmail = user?.UserAttributes?.find(attr => attr.Name === 'email')?.Value;
        }

        const result: any = {
            uuid, status, shop_id: shopId, product_id: productId,
            shop_name: shop?.name,
            shop_detail_html: shop?.detail_html ? await signUrlsInHtml(shop.detail_html, BUCKET_NAME) : undefined,
            shop_email: shopEmail,
            product: product ? {
                ...product,
                image_url: product.image_url ? await signUrlIfS3(product.image_url, BUCKET_NAME) : undefined,
                detail_html: product.detail_html ? await signUrlsInHtml(product.detail_html, BUCKET_NAME) : undefined
            } : null,
            design: design ? {
                design_id: designId,
                thumbf: design.thumbf?.startsWith('/') ? design.thumbf : await signUrlIfS3(design.thumbf, BUCKET_NAME),
                thumbb: design.thumbb?.startsWith('/') ? design.thumbb : await signUrlIfS3(design.thumbb, BUCKET_NAME),
                bgimgf: design.bgimgf?.startsWith('/') ? design.bgimgf : await signUrlIfS3(design.bgimgf, BUCKET_NAME)
            } : null,
            // 権限制御が必要なフィールド
            delivery_company: isAuthorizedByPassword ? order?.delivery_company : undefined,
            tracking_number: isAuthorizedByPassword ? order?.tracking_number : undefined,
            memo_for_users: isAuthorizedByPassword ? item.memo_for_users : undefined,
            ts_expired_at: item.ts_expired_at,
            ts_completed_at: item.ts_completed_at,
            ts_submitted_at: item.ts_submitted_at,
            is_password_protected: isPasswordProtected,
            is_authorized: isAuthorizedByPassword
        };

        return successResponse(result);

    } catch (error: any) {
        console.error('Receive verify error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
