/**
 * 概要: ショップ管理者の取得 (ショップ用)
 * 詳細: 
 *  - ショップに紐づくオーナー(owner_id)およびゼネラルマネージャー(gm_ids)のユーザー情報を取得します。
 *  - 各ユーザーのメールアドレスをテーブル(PK=USER#{id}, SK=SHOP)から並行取得して返します。
 *
 * エンドポイント: POST /shop/admins
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { checkShopOwnerOrGM } from './share/shop-auth';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME } from './share/db';
import { getShopId, getUserId } from './utils/request';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const userId = getUserId(event);
        const body = JSON.parse(event.body || '{}');
        const shopId = getShopId(event, body);

        if (!shopId) return errorResponse(400, 'Missing shopId');
        if (!userId) return errorResponse(401, 'Unauthorized');

        // 【DB操作: 内部モジュールによる GetItem・BatchGetItem】
        // 理由: 権限検証とともに、ショップメタデータ(owner_id, gm_ids)を取得。
        const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId, userId, event);
        if (!shopMetadata) return errorResponse(403, 'Forbidden');

        const ownerId = shopMetadata.owner_id;
        const gmIds = shopMetadata.gm_ids || [];

        // 【DB操作: GetItem (一括並行実行)】
        // 理由: オーナーおよび全GMのメールアドレスを取得します。
        const fetchUserEmail = async (id: string) => {
            const res = await ddb.send(new GetCommand({
                TableName: TABLE_NAME, Key: { PK: `USER#${id}`, SK: 'SHOP' }
            }));
            return res.Item?.email || 'Unknown';
        };

        const [ownerEmail, ...managerEmails] = await Promise.all([
            fetchUserEmail(ownerId),
            ...gmIds.map((id: string) => fetchUserEmail(id))
        ]);

        return successResponse({ 
            owner_email: ownerEmail,
            manager_emails: managerEmails.filter(email => email !== 'Unknown')
        });

    } catch (error: any) {
        console.error('Shop admins error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
