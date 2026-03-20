import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

import { parseGroups } from '../utils/auth';

/**
 * ユーザーがショップのオーナーまたはGMであるか確認する (Lambdaイベントが直接ない場合用)
 */
export async function checkUserShopPermission(ddb: DynamoDBDocumentClient, tableName: string, shopId: string, userId: string) {
    if (!shopId || !userId) return false;

    const userRes = await ddb.send(new GetCommand({
        TableName: tableName,
        Key: { PK: `USER#${userId}`, SK: 'SHOP' }
    }));

    if (!userRes?.Item) return false;
    const userInfo = userRes.Item;

    const owner_shop_ids = userInfo.owner_shop_ids || [];
    const gm_shop_ids = userInfo.gm_shop_ids || [];

    if (!owner_shop_ids.includes(shopId) && !gm_shop_ids.includes(shopId)) return false;

    const shopRes = await ddb.send(new GetCommand({
        TableName: tableName,
        Key: { PK: `SHOP#${shopId}`, SK: 'METADATA' }
    }));
    return shopRes.Item || false;
}

/**
 * ユーザーがショップのオーナーまたはGMであるか確認する
 * @param ddb DynamoDBDocumentClient
 * @param tableName テーブル名
 * @param shopuuid ショップのUUID
 * @param event APIGatewayProxyEvent (認証情報を抽出するため)
 * @returns ショップのメタデータ、または権限がない場合はfalse
 */
export async function checkShopOwnerOrGM(ddb: DynamoDBDocumentClient, tableName: string, shopuuid: string | undefined, userid: string, event: any = null) {

    if (!shopuuid || !userid) return false;

    if (event) {
        const isGlobalAdmin = event.requestContext?.authorizer?.isGlobalAdmin === 'true';

        if (isGlobalAdmin) {
            const shopRes = await ddb.send(new GetCommand({
                TableName: tableName,
                Key: { PK: `SHOP#${shopuuid}`, SK: 'METADATA' }
            }));
            return shopRes.Item || false;
        }
    }

    return checkUserShopPermission(ddb, tableName, shopuuid, userid);
}

