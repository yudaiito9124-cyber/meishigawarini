import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

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
        const claims = event.requestContext?.authorizer?.claims;
        const userid = claims?.sub;
        const userGroups = (claims?.['cognito:groups'] as string[]) || [];
        // GlobalAdmins グループに属している場合は、オーナーチェックをスキップしてメタデータを返す
        const isGlobalAdmin = userGroups.includes('GlobalAdmins');

        if (isGlobalAdmin) {
            const shopRes = await ddb.send(new GetCommand({
                TableName: tableName,
                Key: { PK: `SHOP#${shopuuid}`, SK: 'METADATA' }
            }));
            return shopRes.Item || false;
        }
    }

    const userRes = await ddb.send(new GetCommand({
        TableName: tableName,
        Key: { PK: `USER#${userid}`, SK: 'SHOP' }
    }));

    if (!userRes?.Item) return false;
    const userInfo = userRes.Item;

    // owner_shop_ids または gm_shop_ids に含まれているかチェック
    const owner_shop_ids = userInfo.owner_shop_ids || [];
    const gm_shop_ids = userInfo.gm_shop_ids || [];

    if (!owner_shop_ids.includes(shopuuid) && !gm_shop_ids.includes(shopuuid)) return false;

    const shopRes = await ddb.send(new GetCommand({
        TableName: tableName,
        Key: { PK: `SHOP#${shopuuid}`, SK: 'METADATA' }
    }));
    return shopRes.Item || false;
}

