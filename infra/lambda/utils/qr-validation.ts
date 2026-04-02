import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { stripSignaturesInHtml, stripSignature } from './s3';

/**
 * 概要: QR生成時のパラメータ整合性をチェックする共通関数。
 * 詳細: admin_qr_generate.ts のバリデーションロジックを抽出し、他機能（カード発注等）でも利用可能にする。
 * 
 * @param ddbDocClient DynamoDB Document Client
 * @param tableName テーブル名
 * @param bucketName S3バケット名 (HTML署名除去用)
 * @param params チェック対象のパラメータ群
 * @returns 整合性チェック結果 (shopItem, processedSenderInfo, isLinkeable, validDays)
 * @throws statusCodeとmessageを含むオブジェクト (400系エラー)
 */
export async function validateQRParams(
    ddbDocClient: DynamoDBDocumentClient,
    tableName: string,
    bucketName: string,
    params: {
        shopId?: string;
        productId?: string;
        owner_id?: string;
        activateNow?: boolean;
        senderId?: string;
        senderInfo?: any;
    }
) {
    const { shopId, productId, owner_id, activateNow, senderId, senderInfo } = params;

    // 1. owner_id の検証 (提供されている場合)
    let user_shop_ids: string[] = [];
    if (owner_id) {
        // 【DB操作: GetItem】
        // - 目的: オーナー指定がある場合、ユーザー情報の存在とショップ権限を確認
        // - テーブル: tableName
        // - 検索条件: PK = USER#{owner_id}, SK = "SHOP"
        // - 取得属性: owner_shop_ids, gm_shop_ids
        const userRes = await ddbDocClient.send(new GetCommand({
            TableName: tableName,
            Key: { PK: `USER#${owner_id}`, SK: 'SHOP' }
        }));
        if (!userRes.Item) {
            throw { 
                statusCode: 400, 
                message: 'User ID not found', 
                detail: { owner_id } 
            };
        }
        user_shop_ids = [
            ...(userRes.Item.owner_shop_ids || []),
            ...(userRes.Item.gm_shop_ids || [])
        ];
    }

    // 2. productId の検証 (提供されている場合)
    let product_shopids: string[] = [];
    if (productId) {
        // 【DB操作: Query】
        // - 目的: 商品指定がある場合、その商品の情報を取得（所属ショップ確認用）
        // - テーブル: tableName
        // - インデックス: GSI2 (商品IDからの逆引き)
        // - 検索条件: GSI2_PK = PRODUCT#{productId}
        // - 取得内容: その商品が紐付いているショップのPK (SHOP#{shopId})
        const prodRes = await ddbDocClient.send(new QueryCommand({
            TableName: tableName,
            IndexName: 'GSI2',
            KeyConditionExpression: 'GSI2_PK = :pk',
            ExpressionAttributeValues: {
                ':pk': `PRODUCT#${productId}`
            }
        }));
        if (!prodRes.Items || prodRes.Items.length === 0) {
            throw { 
                statusCode: 400, 
                message: 'Product ID not found', 
                detail: { productId } 
            };
        }
        product_shopids = prodRes.Items.map((item: any) => item.PK.replace(/^SHOP#/, ""));
    }

    // 3. shopId の検証 (提供されている場合)
    let shopItem = null;
    if (shopId) {
        // 【DB操作: GetItem】
        // - 目的: ショップ指定がある場合、ショップメタデータの存在を確認
        // - テーブル: tableName
        // - 検索条件: PK = SHOP#{shopId}, SK = "METADATA"
        const shopRes = await ddbDocClient.send(new GetCommand({
            TableName: tableName,
            Key: { PK: `SHOP#${shopId}`, SK: 'METADATA' }
        }));
        if (!shopRes.Item) {
            throw { 
                statusCode: 400, 
                message: 'Shop ID not found', 
                detail: { shopId } 
            };
        }
        shopItem = shopRes.Item;
    }

    // 4. 整合性チェック (admin_qr_generate.ts と同一のアルゴリズム)
    let isLinkeable = false;
    if (shopId && productId && owner_id) {
        if (!product_shopids.includes(shopId)) {
            throw { 
                statusCode: 400, 
                message: 'Invalid shop and product ID combination', 
                detail: { shopids_fromproductid: product_shopids, shopId } 
            };
        }
        if (!user_shop_ids.includes(shopId)) {
            throw { 
                statusCode: 400, 
                message: 'Unauthorized for target shop', 
                detail: { user_shop_ids, shopId } 
            };
        }
        isLinkeable = true;
    } else if (shopId && productId) {
        if (!product_shopids.includes(shopId)) {
            throw { 
                statusCode: 400, 
                message: 'Invalid shop and product ID combination', 
                detail: { shopids_fromproductid: product_shopids, shopId } 
            };
        }
        isLinkeable = true;
    } else if (shopId && owner_id) {
        if (!user_shop_ids.includes(shopId)) {
            throw { 
                statusCode: 400, 
                message: 'Unauthorized for target shop', 
                detail: { user_shop_ids, shopId } 
            };
        }
    } else if (productId && owner_id) {
        let set_shopids_fromproductid = new Set(product_shopids);
        if (!user_shop_ids.some((item: any) => set_shopids_fromproductid.has(item))) {
            throw { 
                statusCode: 400, 
                message: 'Product is not associated with any authorized shop', 
                detail: { user_shop_ids, shopids_fromproductid: product_shopids } 
            };
        }
    }

    // 5. 有効化フラグの整合性チェック
    if (activateNow && !isLinkeable) {
        throw { 
            statusCode: 400, 
            message: 'Activation requires both shop ID and product ID', 
            detail: { activateNow, isLinkeable } 
        };
    }

    // 6. 有効日数の算出
    let validDays = 180; // デフォルト
    if (activateNow && shopId && productId) {
        // 【DB操作: GetItem】
        // - 目的: 即時有効化する場合、商品の詳細設定（有効期間等）を取得
        // - テーブル: tableName
        // - 検索条件: PK = SHOP#{shopId}, SK = PRODUCT#{productId}
        // - 取得属性: valid_days (有効日数)
        const prodRes = await ddbDocClient.send(new GetCommand({
            TableName: tableName,
            Key: { PK: `SHOP#${shopId}`, SK: `PRODUCT#${productId}` }
        }));
        if (prodRes.Item) {
            validDays = prodRes.Item.valid_days || 180;
        }
    }

    // 7. 送り主情報の処理
    let processedSenderInfo = null;
    if (senderId) {
        const sid = senderId.replace(/^USER#/, "");
        // 【DB操作: GetItem】
        // - 目的: 送り主IDの情報（名称、ロゴ、説明用HTML等）を取得
        // - テーブル: tableName
        // - 検索条件: PK = USER#{sid}, SK = "SENDER"
        // - 取得属性: 項目の全属性
        const senderRes = await ddbDocClient.send(new GetCommand({
            TableName: tableName,
            Key: { PK: `USER#${sid}`, SK: 'SENDER' }
        }));
        if (!senderRes?.Item) {
            throw { 
                statusCode: 400, 
                message: 'Sender ID not found', 
                detail: { senderId: sid } 
            };
        }
        const info = { ...senderRes.Item };
        delete info.PK;
        delete info.SK;
        processedSenderInfo = info;
        processedSenderInfo.sender_id = sid;
    } else if (senderInfo) {
        processedSenderInfo = { ...senderInfo };
    }

    if (processedSenderInfo) {
        processedSenderInfo = {
            ...processedSenderInfo,
            card_image_url: stripSignature(processedSenderInfo.card_image_url),
            html_image_urls: (processedSenderInfo.html_image_urls || []).map((url: string) => stripSignature(url)),
            detail_html: stripSignaturesInHtml(processedSenderInfo.detail_html, bucketName)
        };
    }

    return {
        shopItem,
        processedSenderInfo,
        isLinkeable,
        validDays
    };
}
