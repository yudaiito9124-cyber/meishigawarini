import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { USER_POOL_ID } from '../share/db';

const cognito = new CognitoIdentityProviderClient({});

/**
 * ショップの通知設定（ユーザーIDリスト）に基づき、最新のメールアドレスリストを解決して保存します。
 * 同時に、管理権限を失ったユーザーをリストから自動的に除外します。
 */
export async function refreshMailingLists(ddb: any, tableName: string, shopId: string) {
    // 1. 最新のショップメタデータを取得
    const shopRes = await ddb.send(new GetCommand({
        TableName: tableName,
        Key: { PK: `SHOP#${shopId}`, SK: 'METADATA' }
    }));
    const shop = shopRes.Item;
    if (!shop) return;

    const currentAdmins = new Set([shop.owner_id, ...(shop.gm_ids || [])]);
    
    // 2. 有効なユーザーIDのみを抽出 (管理者リストに含まれているもの)
    const validOrderUserIds = (shop.order_notification_user_ids || []).filter((uid: string) => currentAdmins.has(uid));
    const validInquiryUserIds = (shop.inquiry_notification_user_ids || []).filter((uid: string) => currentAdmins.has(uid));

    // 3. メールアドレスの解決
    const resolveEmails = async (uids: string[]) => {
        const emails = await Promise.all(uids.map(async (uid) => {
            try {
                // DynamoDB から優先的に取得
                const userRes = await ddb.send(new GetCommand({
                    TableName: tableName,
                    Key: { PK: `USER#${uid}`, SK: 'SHOP' }
                }));
                if (userRes.Item?.email) return userRes.Item.email;

                // 見つからない場合は Cognito から取得を試みる
                if (USER_POOL_ID) {
                    const cogRes = await cognito.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: uid }));
                    return cogRes.UserAttributes?.find(a => a.Name === 'email')?.Value;
                }
            } catch (e) {
                console.warn(`Failed to resolve email for user ${uid}:`, e);
            }
            return null;
        }));
        // 重複排除と null 除外
        return Array.from(new Set(emails.filter(e => !!e)));
    };

    const orderMailingList = await resolveEmails(validOrderUserIds);
    const inquiryMailingList = await resolveEmails(validInquiryUserIds);

    // 4. ショップメタデータの更新
    await ddb.send(new UpdateCommand({
        TableName: tableName,
        Key: { PK: `SHOP#${shopId}`, SK: 'METADATA' },
        UpdateExpression: 'SET order_notification_user_ids = :ouid, inquiry_notification_user_ids = :iuid, order_mailing_list = :oml, inquiry_mailing_list = :iml',
        ExpressionAttributeValues: {
            ':ouid': validOrderUserIds,
            ':iuid': validInquiryUserIds,
            ':oml': orderMailingList,
            ':iml': inquiryMailingList
        }
    }));

    return { orderMailingList, inquiryMailingList };
}
