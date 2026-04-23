/**
 * @file receive_verify.ts
 * @role ゲスト用：ギフト券認証・初期データ取得ハンドラー
 * @responsibility
 *  - QR スキャンの第一到達点として、PIN および任意のパスワードによる認証を行い、ギフトの詳細情報を返却します。
 *  - 【二段階認証】
 *    1. `PIN`: 物理カードに記載された 4 桁の番号（ Authorizer で一括検証）。
 *    2. `Password`: 受取人が追加設定した（または管理者による）任意のパスワード。`bcrypt` で安全に照合します。
 *  - 【広域データ集約（Wide Enrichment）】
 *    `BatchGetCommand` を用い、ギフトに関連する「ショップ」「商品」「カードデザイン」「発送情報（ORDER）」を 1 回のクエリで並行取得します。
 *  - 【セキュアな情報開示】
 *    パスワード認証の状態（`isAuthorizedByPassword`）に応じて、追跡番号や管理者メモなどの機密情報の露出を制御します。
 *  - 【プロモーション対応】
 *    `PROMOTION` ステータスのギフトについては、PIN が不明な場合でも限定的な情報の開示を許可する例外ロジックを含みます。
 * @context
 *  - ギフト受取画面のレンダリングに必要な情報のほぼ全てを供給する、最も重要な読み取り API です。
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand, UpdateCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import * as bcrypt from 'bcryptjs';
import { signUrlIfS3, signUrlsInHtml } from './utils/s3';

import { getSystemDesign } from './utils/designs';
import { checkAndExpire } from './utils/expiration';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME, BUCKET_NAME } from './share/db';
import { getQrId, getPIN } from './utils/request';
import { ReceiveApiSchema } from '@shared/api-types';

const cognito = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID || '';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();
        if (event.httpMethod !== 'POST') return errorResponse(405, 'Method Not Allowed');

        const body = JSON.parse(event.body || '{}') as ReceiveApiSchema['receive_verify'];
        const qr_id = getQrId(event, body);
        const pin = getPIN(event, body);
        const { password } = body;

        if (!qr_id || !pin) return errorResponse(400, 'Missing qr_id or pin');

        // 1. QR メタデータの取得
        // Note: PIN 認証および連続試行制限は Authorizer で既に検証済みです。
        const qrRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' }
        }));

        // プロモーション用ギフトを除き、PIN が不一致の場合はリジェクト
        if (!qrRes.Item || String(qrRes.Item.pin) !== String(pin) && qrRes.Item.status !== 'PROMOTION') {
            return errorResponse(404, 'Invalid Gift or PIN');
        }

        const item = qrRes.Item;

        // 2. パスワード保護の検証（設定されている場合）
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

        // 3. 期限切れのリアルタイム判定（Lazy Expiration）
        const status = await checkAndExpire(ddb, TABLE_NAME, qr_id, item as any);

        // 4. 各種関連エンティティのバルク取得（Enrichment）
        const shopId = item.shop_id;
        const productId = item.product_id;
        const designId = item.design_id || (item as any).card_design;

        const keys = [];
        if (shopId) keys.push({ PK: `SHOP#${shopId}`, SK: 'METADATA' });
        if (shopId && productId) keys.push({ PK: `SHOP#${shopId}`, SK: `PRODUCT#${productId}` });
        if (designId) keys.push({ PK: 'CARD_DESIGN#METADATA', SK: designId });
        // パスワード認証成功時かつ発送済みの時のみ、オーダー（発送追跡）情報を取得
        if (isAuthorizedByPassword && status === 'SHIPPED') keys.push({ PK: `QR#${qr_id}`, SK: 'ORDER' });

        const batchRes = await ddb.send(new BatchGetCommand({
            RequestItems: { [TABLE_NAME]: { Keys: keys } }
        }));
        const responses = batchRes.Responses?.[TABLE_NAME] || [];

        const shop = responses.find(r => r.PK === `SHOP#${shopId}` && r.SK === 'METADATA');
        const product = responses.find(r => r.PK === `SHOP#${shopId}` && r.SK === `PRODUCT#${productId}`);
        const designMeta = responses.find(r => r.PK === 'CARD_DESIGN#METADATA' && r.SK === designId);
        const design = designMeta || (designId ? getSystemDesign(designId) : null);
        const order = responses.find(r => r.PK === `QR#${qr_id}` && r.SK === 'ORDER');

        // ショップオーナーの Email フォールバック（Cognito から取得）
        let shopEmail = shop?.email;
        if (!shopEmail && shop?.owner_id && USER_POOL_ID) {
            const user = await cognito.send(new AdminGetUserCommand({
                UserPoolId: USER_POOL_ID, Username: shop.owner_id
            })).catch(() => null);
            shopEmail = user?.UserAttributes?.find(attr => attr.Name === 'email')?.Value;
        }

        // 表示用レスポンスの構築とアセットの閲覧用署名
        const result: any = {
            qr_id, status, shop_id: shopId, product_id: productId,
            shop_name: shop?.name,
            shop_detail_html: shop?.detail_html ? await signUrlsInHtml(shop.detail_html, BUCKET_NAME) : undefined,
            shop_email: shopEmail,
            shortest_delivery_days: shop?.shortest_delivery_days ?? 3,
            delivery_time_options: shop?.delivery_time_options ?? ["timeMorning", "time1416", "time1618", "time1820", "time1921"],
            product: product ? {
                ...product,
                image_url: product.image_url ? await signUrlIfS3(product.image_url, BUCKET_NAME) : undefined,
                detail_html: product.detail_html ? await signUrlsInHtml(product.detail_html, BUCKET_NAME) : undefined
            } : null,
            design: design ? {
                design_id: designId,
                // システム標準デザイン（パス始まり）か S3 デザインかを判別して署名
                thumbf: design.thumbf?.startsWith('/') ? design.thumbf : await signUrlIfS3(design.thumbf, BUCKET_NAME),
                thumbb: design.thumbb?.startsWith('/') ? design.thumbb : await signUrlIfS3(design.thumbb, BUCKET_NAME),
                bgimgf: design.bgimgf?.startsWith('/') ? design.bgimgf : await signUrlIfS3(design.bgimgf, BUCKET_NAME)
            } : null,
            // 【セキュリティ】認証状態に応じて機密情報を出し分け
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
