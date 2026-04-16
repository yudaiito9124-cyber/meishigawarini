/**
 * @file shop_admins.ts
 * @role ショップ用：管理者（スタッフ）情報取得ハンドラー
 * @responsibility
 *  - ショップを運営するオーナーおよびゼネラルマネージャー（GM）の連絡先情報（メールアドレス）を収集します。
 *  - 【高スループットな並行取得】
 *    ショップメタデータに記録されている複数のユーザー ID を元に、関連付けられた電子メール情報を `USER#{id}` レコードから一括並行（Promise.all）で取得します。
 * @context
 *  - ショップ管理画面の設定やスタッフ一覧表示で使用され、運用チームの構成を可視化します。
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { checkShopOwnerOrGM } from './share/shop-auth';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME } from './share/db';
import { getShopId, getUserId } from './utils/request';
import { ShopApiSchema } from '@shared/api-types';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const userId = getUserId(event);
        const body = JSON.parse(event.body || '{}') as ShopApiSchema['shop_admins'];
        const shopId = getShopId(event, body);

        if (!shopId) return errorResponse(400, 'Missing shopId');
        if (!userId) return errorResponse(401, 'Unauthorized');

        // 権限検証: 同時にショップの管理者構成（owner_id, gm_ids）を取得
        const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId, userId, event);
        if (!shopMetadata) return errorResponse(403, 'Forbidden');

        const ownerId = shopMetadata.owner_id;
        const gmIds = shopMetadata.gm_ids || [];

        // 【並行取得パターン】
        // 理由: 個々のユーザー情報をシーケンシャルに取得するとレイテンシが増大するため、全件を Promise.all で並行実行します。
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
            manager_emails: managerEmails.filter(email => email !== 'Unknown') // 実在するメールのみをフィルタ
        });

    } catch (error: any) {
        console.error('Shop admins error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
