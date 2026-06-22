/**
 * @file admin_settings.ts
 * @role 管理者：システム管理者一覧およびシステム管理者通知設定の取得・更新ハンドラー
 * @responsibility
 *  - Cognito のシステム管理者（Administrators / GlobalAdmins）を取得して一覧化します。
 *  - システム管理者宛ての通知設定（物理カード発注時、お問い合わせ発生時）の管理、および通知先メールアドレスの同期を管理します。
 *  - 【ライフサイクル管理】以下の操作を管理します。
 *    - `get`: Cognito の管理者一覧と、現在の通知設定（DynamoDB の SYSTEM#SETTINGS、METADATA）を取得。
 *    - `update`: 管理者が選択したユーザーIDを保存し、メールアドレスを逆引きしてメーリングリスト（admin_order_mailing_list, admin_inquiry_mailing_list）を更新。
 * @context
 *  - 管理画面の設定ダイアログ（AdminSettingsSection）のバックエンドAPIとして機能します。
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, ListUsersInGroupCommand } from '@aws-sdk/client-cognito-identity-provider';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME } from './share/db';
import { getAction, getUserId } from './utils/request';
import { AdminApiSchema } from '@shared/api-types';

const cognito = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID || '';

/** 管理者ユーザーの型定義 */
interface AdminUser {
    id: string;
    email?: string;
    name: string;
    groups: string[];
}

/**
 * Cognito から Administrators と GlobalAdmins グループに属するユーザーの一覧を取得します。
 */
const getAdminsFromCognito = async (): Promise<AdminUser[]> => {
    if (!USER_POOL_ID) return [];
    
    const adminsMap = new Map<string, AdminUser>();
    
    const fetchGroup = async (groupName: string) => {
        try {
            const res = await cognito.send(new ListUsersInGroupCommand({
                UserPoolId: USER_POOL_ID,
                GroupName: groupName,
            }));
            
            for (const u of res.Users || []) {
                if (u.Username) {
                    const email = u.Attributes?.find(a => a.Name === 'email')?.Value;
                    const name = u.Attributes?.find(a => a.Name === 'name')?.Value || 'No Name';
                    
                    const existing = adminsMap.get(u.Username);
                    if (existing) {
                        existing.groups.push(groupName);
                    } else {
                        adminsMap.set(u.Username, {
                            id: u.Username,
                            email,
                            name,
                            groups: [groupName]
                        });
                    }
                }
            }
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            console.warn(`Failed to fetch group ${groupName}:`, message);
        }
    };
    
    await fetchGroup('Administrators');
    await fetchGroup('GlobalAdmins');
    
    return Array.from(adminsMap.values());
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}');
        const userId = getUserId(event);
        const action = getAction(event, body);

        if (!userId) return errorResponse(401, 'Unauthorized');
        if (!USER_POOL_ID) return errorResponse(500, 'USER_POOL_ID is not set');

        if (action === 'get') {
            const admins = await getAdminsFromCognito();
            
            // --------------------------------------------------------------------
            // データベース参照: システム設定 (SYSTEM#SETTINGS, METADATA) の取得
            // 目的: 保存済みの通知設定（通知対象の管理者ユーザーID）を取得します。
            // --------------------------------------------------------------------
            const res = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: 'SYSTEM#SETTINGS', SK: 'METADATA' }
            }));
            
            const settings = res.Item || {};
            
            return successResponse({
                admins,
                settings: {
                    admin_order_notification_user_ids: settings.admin_order_notification_user_ids || [],
                    admin_inquiry_notification_user_ids: settings.admin_inquiry_notification_user_ids || [],
                }
            });
        }
        
        if (action === 'update') {
            const { admin_order_notification_user_ids, admin_inquiry_notification_user_ids } = body as AdminApiSchema['admin_settings_update'];
            
            const orderUserIds = Array.isArray(admin_order_notification_user_ids) ? admin_order_notification_user_ids : [];
            const inquiryUserIds = Array.isArray(admin_inquiry_notification_user_ids) ? admin_inquiry_notification_user_ids : [];
            
            const allAdmins = await getAdminsFromCognito();
            const getEmails = (uids: string[]) => {
                return uids.map(uid => allAdmins.find(a => a.id === uid)?.email)
                           .filter((e): e is string => !!e);
            };
            
            const orderMailingList = Array.from(new Set(getEmails(orderUserIds)));
            const inquiryMailingList = Array.from(new Set(getEmails(inquiryUserIds)));
            
            const now = new Date().toISOString();
            
            // --------------------------------------------------------------------
            // データベース更新: システム設定 (SYSTEM#SETTINGS, METADATA) の更新
            // 目的: 新しい通知対象のユーザーID、および逆引きしたメーリングリストを保存します。
            // 状態遷移:
            //   - admin_order_notification_user_ids / admin_inquiry_notification_user_ids を設定
            //   - admin_order_mailing_list / admin_inquiry_mailing_list を設定
            //   - ts_updated_at に現在時刻を設定
            // --------------------------------------------------------------------
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: 'SYSTEM#SETTINGS', SK: 'METADATA' },
                UpdateExpression: `SET admin_order_notification_user_ids = :ouid,
                                       admin_inquiry_notification_user_ids = :iuid,
                                       admin_order_mailing_list = :oml,
                                       admin_inquiry_mailing_list = :iml,
                                       ts_updated_at = :now`,
                ExpressionAttributeValues: {
                    ':ouid': orderUserIds,
                    ':iuid': inquiryUserIds,
                    ':oml': orderMailingList,
                    ':iml': inquiryMailingList,
                    ':now': now,
                }
            }));
            
            return successResponse({ message: 'Settings updated successfully' });
        }
        
        return errorResponse(404, 'Unknown action');
    } catch (error: any) {
        console.error('Admin settings error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
