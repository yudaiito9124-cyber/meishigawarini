/**
 * @file qr-validation.ts
 * @role QR コード / カード発注パラメータ整合性検証ユーティリティ
 * @responsibility
 *  - QR コード生成時やカードの発注作成時において、指定されたショップ、商品、オーナー、送り主の情報の整合性を厳格にチェックします。
 *  - 不正な組み合わせ（例：他人のショップに商品を紐付ける等）を未然に防ぎ、データクリーンネスを維持します。
 *  - S3 URL の署名（クエリパラメータ）を自動的に除去し、永続化に適したクリーンなパスへ変換します。
 * @context
 *  - `admin_qr_generate.ts` や `admin_card_orders.ts` などの管理系アクションから、主要なバリデーションエンジンとして呼び出されます。
 */

import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { stripSignaturesInHtml, stripSignature } from './s3';

/**
 * QR 生成、またはカード発注時に提供されたパラメータの整合性を包括的にチェックします。
 * 
 * @description
 * 以下の 7 段階の検証を実施します：
 * 1. オーナー所属確認: 指定された owner_id が実在し、対象ショップの権限（owner/gm）を持っているか。
 * 2. 商品所属確認: 指定された productId がどのショップに属しているかを逆引き (GSI2) して特定。
 * 3. ショップ実在確認: shopId で指定されたショップが METADATA レコードとして存在するか。
 * 4. 複合整合性チェック: shopId + productId + owner_id の全組み合わせが論理的に正しいか（相互の紐付けが正しいか）。
 * 5. 有効化フラグとの連動: `activateNow`（即時有効化）が true の場合、ショップと商品が両方指定されていることを強制します。
 * 6. 有効日数の算出: 商品設定（valid_days）から、生成されるギフトの有効期限を決定します。
 * 7. 送り主情報のクレンジング: HTML 本文や画像パスに含まれる S3 署名を除去し、正規化します。
 * 
 * @param ddbDocClient - DynamoDBDocumentClient。
 * @param tableName - テーブル名。
 * @param bucketName - S3 バケット名 (HTML 処理用)。
 * @param params - チェック対象の ID 群とオブジェクト。
 * @returns 整合性チェックを通過したメタデータ群。
 * @throws 400 Bad Request シリーズのエラーオブジェクト。
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

    // --------------------------------------------------------------------
    // 1. owner_id の検証 (提供されている場合)
    // --------------------------------------------------------------------
    // 目的: 外部から指定されたオーナー ID が、実際にその役割を果たせる状態かを確認します。
    let user_shop_ids: string[] = [];
    if (owner_id) {
        // [DB 操作: GetItem] PK: USER#<id>, SK: SHOP
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

    // --------------------------------------------------------------------
    // 2. productId の検証 (提供されている場合)
    // --------------------------------------------------------------------
    // 目的: 商品 ID (UUID) から、その商品がどのショップに属しているかを特定します。
    let product_shopids: string[] = [];
    if (productId) {
        // [DB 操作: Query] Index: GSI2, GSI2_PK: PRODUCT#<uuid>
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
        // 商品は複数のショップに複製/紐付いている可能性があるため、リスト化します。
        product_shopids = prodRes.Items.map((item: any) => item.PK.replace(/^SHOP#/, ""));
    }

    // --------------------------------------------------------------------
    // 3. shopId の検証 (提供されている場合)
    // --------------------------------------------------------------------
    // 目的: ショップ自体が削除されておらず、有効な状態であることを確認します。
    let shopItem = null;
    if (shopId) {
        // [DB 操作: GetItem] PK: SHOP#<id>, SK: METADATA
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

    // --------------------------------------------------------------------
    // 4. 複合整合性チェック
    // --------------------------------------------------------------------
    // 目的: 提供された各 ID 間で、矛盾した紐付けがないかを厳密にマトリックス検証します。
    let isLinkeable = false;
    if (shopId && productId && owner_id) {
        // ショップ、商品、オーナーの三者が揃っている場合、それらが全て同一系統であることを確認
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
        // オーナー未指定だがショップと商品はある場合
        if (!product_shopids.includes(shopId)) {
            throw { 
                statusCode: 400, 
                message: 'Invalid shop and product ID combination', 
                detail: { shopids_fromproductid: product_shopids, shopId } 
            };
        }
        isLinkeable = true;
    } else if (shopId && owner_id) {
        // ショップとオーナーの権限確認
        if (!user_shop_ids.includes(shopId)) {
            throw { 
                statusCode: 400, 
                message: 'Unauthorized for target shop', 
                detail: { user_shop_ids, shopId } 
            };
        }
    } else if (productId && owner_id) {
        // 商品とオーナーの紐付け確認
        let set_shopids_fromproductid = new Set(product_shopids);
        if (!user_shop_ids.some((item: any) => set_shopids_fromproductid.has(item))) {
            throw { 
                statusCode: 400, 
                message: 'Product is not associated with any authorized shop', 
                detail: { user_shop_ids, shopids_fromproductid: product_shopids } 
            };
        }
    }

    // --------------------------------------------------------------------
    // 5. 有効化フラグの整合性チェック
    // --------------------------------------------------------------------
    // 目的: 「即時有効化」は商品情報が完全に紐付いていないと実行できないことを保証します。
    if (activateNow && !isLinkeable) {
        throw { 
            statusCode: 400, 
            message: 'Activation requires both shop ID and product ID', 
            detail: { activateNow, isLinkeable } 
        };
    }

    // --------------------------------------------------------------------
    // 6. 有効日数の算出
    // --------------------------------------------------------------------
    // 目的: 商品個別の有効期限設定がある場合はそれを使い、なければデフォルトの 180 日を採用します。
    let validDays = 180; // デフォルト設定
    if (activateNow && shopId && productId) {
        // [DB 操作: GetItem] PK: SHOP#<id>, SK: PRODUCT#<id>
        const prodRes = await ddbDocClient.send(new GetCommand({
            TableName: tableName,
            Key: { PK: `SHOP#${shopId}`, SK: `PRODUCT#${productId}` }
        }));
        if (prodRes.Item) {
            validDays = prodRes.Item.valid_days || 180;
        }
    }

    // --------------------------------------------------------------------
    // 7. 送り主情報の処理とクレンジング
    // --------------------------------------------------------------------
    // 目的: データベースへの保存に適した形にデータを正規化（S3 署名の除去等）します。
    let processedSenderInfo = null;
    if (senderId) {
        const sid = senderId.replace(/^USER#/, "");
        // [DB 操作: GetItem] PK: USER#<id>, SK: SENDER
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

    // 画像 URL や HTML 内部の S3 署名（?AWSAccessKeyId=...）を一括除去します。
    // 署名付き URL は有効期限が短いため、DB にはクリーンなパスのみを保存すべきです。
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
