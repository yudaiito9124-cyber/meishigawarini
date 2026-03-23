import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

/**
 * ユーザーがショップのオーナーまたはGMであるか確認する (Lambdaイベントが直接ない場合、またはより詳細なチェックが必要な場合)
 */
export async function checkUserShopPermission(ddb: DynamoDBDocumentClient, tableName: string, shopId: string, userId: string) {
    if (!shopId || !userId) return false;

    // 1. User Role Record の確認
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
            // ショップのメタデータも取得して返す
            const shopRes = await ddb.send(new GetCommand({
                TableName: tableName,
                Key: { PK: `SHOP#${shopId}`, SK: 'METADATA' },
                ConsistentRead: true
            }));
            return shopRes.Item || false;
        }
    }

    // 2. Fallback: Shop Metadata 側の owner_id/gm_ids を直接確認
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
 * ユーザーがGlobalAdmin、ショップのオーナーまたはGMであるか確認する
 * @param ddb DynamoDBDocumentClient
 * @param tableName テーブル名
 * @param shopuuid ショップのUUID
 * @param userid ユーザーのID (sub)
 * @param event APIGatewayProxyEvent (認証情報を抽出するため)
 * @param groups Cognitoグループ配列 (オーソライザー用)
 * @returns ショップのメタデータ、または権限がない場合はfalse
 */
export async function checkShopOwnerOrGM(
    ddb: DynamoDBDocumentClient,
    tableName: string,
    shopuuid: string | undefined,
    userid: string,
    event: any = null,
    groups: string[] = []
) {
    if (!shopuuid || !userid) return false;

    // 1. GlobalAdmin, Administratorのチェック
    let userGroups = groups;
    if (event && event.requestContext?.authorizer?.groups) {
        // Lambda内部で呼び出された場合、オーソライザーから渡されたグループ情報をパース
        try {
            const parsed = JSON.parse(event.requestContext.authorizer.groups);
            if (Array.isArray(parsed)) userGroups = parsed;
        } catch (e) { }
    }

    if (userGroups.includes('GlobalAdmins') || (event && event.requestContext?.authorizer?.isGlobalAdmin === 'true')) {
        // GlobalAdminのみは全ショップにアクセス可能
        const shopRes = await ddb.send(new GetCommand({
            TableName: tableName,
            Key: { PK: `SHOP#${shopuuid}`, SK: 'METADATA' },
            ConsistentRead: true
        }));
        return shopRes.Item || false;
    }

    // 2. ショップ個別権限のチェック
    return checkUserShopPermission(ddb, tableName, shopuuid, userid);
}

