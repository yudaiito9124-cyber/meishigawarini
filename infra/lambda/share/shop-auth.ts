/**
 * @file shop-auth.ts
 * @role ショップ権限管理共通モジュール
 * @responsibility
 *  - 特定のユーザーがショップの操作権限（オーナー権限またはGM権限）を持っているかを検証します。
 *  - 管理者（GlobalAdmins）に対する全ショップアクセス許可の判定機能を提供します。
 * @context
 *  - ショップ関連の API（商品の追加、情報の更新等）を処理する Lambda 関数内で共通して利用されます。
 *  - Cognito ユーザープールに紐づく属性や DynamoDB 上の権限レコードを参照します。
 */

import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

/**
 * 特定のユーザーがショップに対して操作権限を持っているかを、DynamoDB レコードを直接参照して確認します。
 * 
 * @description
 * 権限確認は二段階で行われます：
 * 1. ユーザー側の権限リスト（USER#<userId> / SK: SHOP）を確認：アクセス効率を考慮し、ユーザーが複数のショップを管理している場合に有利な構造です。
 * 2. ショップ側のメタデータ（SHOP#<shopId> / SK: METADATA）を確認：ユーザー側のレコードが不足している場合のフォールバックとして機能します。
 * 
 * @param ddb - 初期化済みの DynamoDBDocumentClient。
 * @param tableName - 操作対象の DynamoDB テーブル名。
 * @param shopId - アクセス権を検証したいショップの ID。
 * @param userId - 検証対象のユーザー ID (Cognito sub)。
 * @returns 権限がある場合はショップの METADATA オブジェクト、ない場合は false を返します。
 */
export async function checkUserShopPermission(ddb: DynamoDBDocumentClient, tableName: string, shopId: string, userId: string) {
    if (!shopId || !userId) return false;

    // --------------------------------------------------------------------
    // 1. User Role Record の確認
    // --------------------------------------------------------------------
    // 目的: ユーザーが管理しているショップのリストを一括取得し、対象の shopId が含まれているか判定します。
    // PK: USER#<userId>, SK: SHOP
    // 状態: ConsistentRead を true に設定し、権限付与直後の操作でも確実に最新の権限情報を取得します。
    const userRes = await ddb.send(new GetCommand({
        TableName: tableName,
        Key: { PK: `USER#${userId}`, SK: 'SHOP' },
        ConsistentRead: true
    }));

    if (userRes?.Item) {
        const userInfo = userRes.Item;
        const owner_shop_ids = userInfo.owner_shop_ids || [];
        const gm_shop_ids = userInfo.gm_shop_ids || [];

        if (owner_shop_ids.includes(shopId) || gm_shop_ids.includes(shopId)) {
            // ショップの基本情報（METADATA）を取得して返却
            // PK: SHOP#<shopId>, SK: METADATA
            const shopRes = await ddb.send(new GetCommand({
                TableName: tableName,
                Key: { PK: `SHOP#${shopId}`, SK: 'METADATA' },
                ConsistentRead: true
            }));
            return shopRes.Item || false;
        }
    }

    // --------------------------------------------------------------------
    // 2. Fallback: Shop Metadata 側の直接確認
    // --------------------------------------------------------------------
    // 目的: ユーザーレコードに情報がない場合、ショップ側の owner_id や gm_ids フィールドを直接参照します。
    // PK: SHOP#<shopId>, SK: METADATA
    const shopRes = await ddb.send(new GetCommand({
        TableName: tableName,
        Key: { PK: `SHOP#${shopId}`, SK: 'METADATA' },
        ConsistentRead: true
    }));

    if (!shopRes.Item) return false;

    const isOwner = shopRes.Item.owner_id === userId;
    const isGM = (shopRes.Item.gm_ids || []).includes(userId);

    if (isOwner || isGM) {
        return shopRes.Item;
    }

    return false;
}

/**
 * システム全体の管理者（GlobalAdmin）またはショップ個別の権限者がショップを操作できるかを確認します。
 * 
 * @description
 * GlobalAdmin グループに所属するユーザーは、個別のショップ権限設定に関わらず全てのショップに対して
 * 読み取り・書き込み権限を持ちます。この関数はまず管理者権限をチェックし、該当しない場合に
 * 個別ショップ権限（checkUserShopPermission）へ委譲します。
 * 
 * @param ddb - DynamoDBDocumentClient。
 * @param tableName - テーブル名。
 * @param shop_id - 検証対象のショップ ID。
 * @param user_id - ユーザー ID (Cognito sub)。
 * @param event - Lambda 実行イベント。Cognito ループ情報のパースに使用します。
 * @param groups - 事前に取得済みの Cognito グループ配列。
 * @returns ショップのメタデータ（権限あり）または false（権限なし）。
 */
export async function checkShopOwnerOrGM(
    ddb: DynamoDBDocumentClient,
    tableName: string,
    shop_id: string | undefined,
    user_id: string,
    event: any = null,
    groups: string[] = []
) {
    if (!shop_id || !user_id) return false;

    // 1. GlobalAdmin, Administrator のチェック
    let userGroups = groups;
    if (event && event.requestContext?.authorizer?.groups) {
        // Lambda Authorizer から渡されたグループ情報を JSON パース
        try {
            const parsed = JSON.parse(event.requestContext.authorizer.groups);
            if (Array.isArray(parsed)) userGroups = parsed;
        } catch (e) { }
    }

    // GlobalAdmin 属性またはグループ所属を判定
    if (userGroups.includes('GlobalAdmins') || (event && event.requestContext?.authorizer?.is_global_admin === 'true')) {
        // 管理者のためのショップデータ取得
        const shopRes = await ddb.send(new GetCommand({
            TableName: tableName,
            Key: { PK: `SHOP#${shop_id}`, SK: 'METADATA' },
            ConsistentRead: true
        }));
        return shopRes.Item || false;
    }

    // 2. ショップ個別権限のチェックへ委譲
    return checkUserShopPermission(ddb, tableName, shop_id, user_id);
}

