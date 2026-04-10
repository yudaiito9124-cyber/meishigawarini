/**
 * @file user_receiver.ts
 * @role ユーザー用：デフォルト配送先（受取人情報）管理ハンドラー
 * @responsibility
 *  - ユーザーがギフトを受け取る際に入力する「配送先情報」のテンプレートを管理します。
 *  - 【入力の簡略化（Pre-fill）】
 *    ここで保存された情報は、ギフト受取画面（チェックアウト）の入力フォームに自動補完されるため、リピート受取人の体験を向上させます。
 *  - 【命名規則のブリッジ】
 *    - API・フロントエンド: `snake_case` (例: `zip_code`)
 *    - DynamoDB 内部属性: `camelCase` (例: `zipCode`)
 *    このハンドラーが両者の変換レイヤー（Adapter）として機能します。
 *  - 【属性の保護と自動初期化】
 *    `PK` や `SK` といったシステム属性の不正上書きを防ぐため、許可されたフィールドのみを抽出して更新します。
 *    初回保存時には `ts_created_at` を自動的にセットします。
 * @context
 *  - 被贈答者（Receiver）の利便性を高めるための、プロファイル管理の一環です。
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME } from './share/db';
import { getUserId, getAction } from './utils/request';
import { UserApiSchema } from '@shared/api-types';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const userId = getUserId(event);
        if (!userId) return errorResponse(401, 'Unauthorized');

        const body = JSON.parse(event.body || '{}');
        const action = getAction(event, body);

        // --------------------------------------------------------------------
        // ACTION: get (配送先デフォルト情報の取得)
        // 目的: 自身の「受取人テンプレート」を取得。
        // --------------------------------------------------------------------
        if (action === 'get') {
            const getRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `USER#${userId}`, SK: 'RECEIVER' }
            }));

            if (!getRes.Item) {
                return successResponse({ receiver_info: null });
            }

            const item = getRes.Item;
            // 変換レイヤー: 内部属性 (camelCase) -> API 仕様 (snake_case)
            const receiver_info = {
                name: item.name,
                zip_code: item.zipCode || item.zip_code, // 移行期対応
                address: item.address,
                phone: item.phone,
                email: item.email
            };

            return successResponse({ receiver_info });
        }

        // --------------------------------------------------------------------
        // ACTION: update (配送先デフォルト情報の更新)
        // 目的: 自身の受取人情報を保存・更新。
        // --------------------------------------------------------------------
        if (action === 'update') {
            const { receiver_info } = body as UserApiSchema['user_receiver_update'];
            if (!receiver_info) return errorResponse(400, 'Missing receiver_info data');

            // 変換レイヤー: API 指定 (snake_case) -> 内部属性 (camelCase)
            const dbFields: any = { ...receiver_info };
            if (receiver_info.zip_code !== undefined) {
                dbFields.zipCode = receiver_info.zip_code;
                delete dbFields.zip_code;
            }

            // 【セキュリティ】許可されたフィールドのみを抽出（PK/SK などの上書き防止）
            const allowedFields = ['name', 'zipCode', 'address', 'phone', 'email'];
            const keys = Object.keys(dbFields).filter(k => allowedFields.includes(k));
            
            if (keys.length === 0) return errorResponse(400, 'No valid fields to update');

            const updateExpressions = ['#ts_up = :now', '#ts_cr = if_not_exists(#ts_cr, :now)'];
            const expressionAttributeNames: any = {
                '#ts_up': 'ts_updated_at',
                '#ts_cr': 'ts_created_at'
            };
            const expressionAttributeValues: any = {
                ':now': new Date().toISOString()
            };

            keys.forEach((k, i) => {
                updateExpressions.push(`#f${i} = :v${i}`);
                expressionAttributeNames[`#f${i}`] = k;
                expressionAttributeValues[`:v${i}`] = dbFields[k];
            });

            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `USER#${userId}`, SK: 'RECEIVER' },
                UpdateExpression: 'SET ' + updateExpressions.join(', '),
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues
            }));

            return successResponse({ message: 'Receiver info updated successfully' });
        }

        return errorResponse(400, `Invalid action: ${action}`);

    } catch (error: any) {
        console.error('User receiver error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
