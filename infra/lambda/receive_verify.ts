/**
 * 概要: ギフトUUIDとPINの検証、およびギフト情報の取得
 * 詳細: ユーザーが入力したUUIDとPINが正しいか検証し、紐付いている商品情報やショップ情報を返します。
 * エンドポイント: POST /receive/verify
 * リクエストボディ:
 *  - uuid: ギフト（QR）のUUID (必須)
 *  - pin: 4桁のPINコード (必須)
 *  - password: 二要素認証用のパスワード (オプション)
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import * as bcrypt from 'bcryptjs';
import { isLocked, getRateLimitUpdate, getResetRateLimitUpdate } from './utils/rate-limit';
import { signUrlIfS3, signUrlsInHtml } from './utils/s3';
import { checkAndExpire } from './utils/expiration';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true,
        convertEmptyValues: true
    }
});
const cognito = new CognitoIdentityProviderClient({});
const TABLE_NAME = process.env.TABLE_NAME || '';
const USER_POOL_ID = process.env.USER_POOL_ID || '';
const BUCKET_NAME = process.env.BUCKET_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-QR-UUID,X-QR-PIN',
    'Access-Control-Allow-Methods': 'OPTIONS,POST'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };
        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };
        }

        const body = JSON.parse(event.body || '{}');
        const { uuid, pin, password } = body;

        if (!uuid || !pin) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing UUID or PIN' }) };
        }

        // 【DB操作: GetItem】
        // - 目的: 入力されたUUIDに基づくQRコード自体の存在確認と状態(メタデータ)取得
        // - テーブル: TABLE_NAME (DynamoDB)
        // - キー構成:
        //   - PK: `QR#${uuid}` (QRコードUUID)
        //   - SK: 'METADATA' (QRメタデータの固定SK)
        // - 取得項目: status, pin, failed_attempts, ts_expired_at 等
        const getRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${uuid}`, SK: 'METADATA' }
        }));

        if (!getRes.Item) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid Gift or PIN' }) };
        const item = getRes.Item;

        // レートリミット管理
        if (isLocked(item)) return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'Too many attempts.' }) };

        // PIN検証
        if (String(item.pin) !== String(pin)) {
            const { UpdateExpression, ExpressionAttributeValues, ExpressionAttributeNames } = getRateLimitUpdate(item);
            // 【DB操作: UpdateItem】
            // - 目的: PIN入力失敗回数のインクリメント、および上限到達時のロック(レートリミット)処理
            // - テーブル: TABLE_NAME (DynamoDB)
            // - キー構成: { PK: `QR#${uuid}`, SK: 'METADATA' }
            // - 更新内容: failed_attempts のインクリメント、必要に応じて locked_until のセット
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME, Key: { PK: `QR#${uuid}`, SK: 'METADATA' },
                UpdateExpression, ExpressionAttributeValues, ExpressionAttributeNames
            }));
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid Gift or PIN' }) };
        }

        // 成功時にカウンタリセット
        if (item.failed_attempts || item.locked_until) {
            const { UpdateExpression, ExpressionAttributeNames } = getResetRateLimitUpdate();
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME, Key: { PK: `QR#${uuid}`, SK: 'METADATA' },
                UpdateExpression, ExpressionAttributeNames
            })).catch(e => console.error("Reset failed", e));
        }

        // パスワード保護の検証
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

        const { product_id, shop_id } = item;
        
        // 期限切れチェック (共通ユーティリティ)
        const status = await checkAndExpire(ddb, TABLE_NAME, uuid, item as any);

        // 商品情報の取得
        let product = null;
        if (shop_id && product_id) {
            // 【DB操作: GetItem】
            // - 目的: QRコードに紐付いている具体的な商品(PRODUCT)の詳細情報を取得
            // - テーブル: TABLE_NAME (DynamoDB)
            // - キー構成:
            //   - PK: `SHOP#${shop_id}`
            //   - SK: `PRODUCT#${product_id}`
            const prodRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `SHOP#${shop_id}`, SK: `PRODUCT#${product_id}` } }));
            product = prodRes.Item;
            if (product) {
                if (product.image_url) product.image_url = await signUrlIfS3(product.image_url, BUCKET_NAME);
                if (product.detail_html) product.detail_html = await signUrlsInHtml(product.detail_html, BUCKET_NAME);
            }
        }

        // ショップ情報の取得
        let shop_email = undefined, shop_name = undefined, shop_detail_html = undefined;
        if (shop_id && isAuthorizedByPassword) {
            // 【DB操作: GetItem】
            // - 目的: ギフトの提供元ショップのメタデータ(名称, 連絡先メール等)を取得
            // - テーブル: TABLE_NAME (DynamoDB)
            // - キー構成: { PK: `SHOP#${shop_id}`, SK: 'METADATA' }
            const shopRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `SHOP#${shop_id}`, SK: 'METADATA' } }));
            if (shopRes.Item) {
                shop_email = shopRes.Item.email;
                shop_name = shopRes.Item.name;
                shop_detail_html = await signUrlsInHtml(shopRes.Item.detail_html, BUCKET_NAME);

                // Email不在時のCognitoフォールバック
                if (!shop_email && shopRes.Item.owner_id && USER_POOL_ID) {
                    const user = await cognito.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: shopRes.Item.owner_id })).catch(() => null);
                    shop_email = user?.UserAttributes?.find(attr => attr.Name === 'email')?.Value;
                }
            }
        }

        // 発送済みの場合の追跡情報取得
        let delivery_company = undefined, tracking_number = undefined;
        if (isAuthorizedByPassword && status === 'SHIPPED') {
            // 【DB操作: GetItem】
            // - 目的: 発送済み(SHIPPED)の場合、登録されている配送情報(配送会社, 追跡番号)を取得
            // - テーブル: TABLE_NAME (DynamoDB)
            // - キー構成: { PK: `QR#${uuid}`, SK: 'ORDER' }
            const orderRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `QR#${uuid}`, SK: 'ORDER' } }));
            if (orderRes.Item) {
                delivery_company = orderRes.Item.delivery_company;
                tracking_number = orderRes.Item.tracking_number;
            }
        }

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                uuid, status, product_id, shop_id, product, shop_email, shop_name, shop_detail_html,
                delivery_company: isAuthorizedByPassword ? delivery_company : undefined,
                tracking_number: isAuthorizedByPassword ? tracking_number : undefined,
                memo_for_users: isAuthorizedByPassword ? item.memo_for_users : undefined,
                ts_expired_at: item.ts_expired_at,
                ts_completed_at: item.ts_completed_at,
                ts_submitted_at: item.ts_submitted_at,
                is_password_protected: isPasswordProtected,
                is_authorized: isAuthorizedByPassword
            })
        };

    } catch (error: any) {
        console.error(error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error' }) };
    }
};
