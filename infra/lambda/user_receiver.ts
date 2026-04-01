/**
 * 概要: 受取人（Receiver）の共通プロフィール管理
 * 詳細:
 *  - ユーザーがギフトを受け取る際のデフォルトの配送先情報を管理します。
 *  - ここで保存された情報は、ギフト受取時の入力フォームに自動補完（プリフィル）するために使用されます。
 *  - 配送先情報は、氏名、郵便番号、住所、電話番号、メールアドレス等を含みます。
 *  - APIでは snake_case (zip_code) を使用し、DynamoDB内では camelCase (zipCode) を使用します。
 *
 * エンドポイント:
 *  - POST /user/profile/receiver-get (配送先デフォルト情報を取得)
 *  - POST /user/profile/receiver-update (配送先デフォルト情報を更新)
 *
 * データ構造:
 *  - PK: USER#{userId}
 *  - SK: RECEIVER
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME } from './share/db';
import { getUserId, getAction } from './utils/request';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const userId = getUserId(event);
        if (!userId) return errorResponse(401, 'Unauthorized');

        const body = JSON.parse(event.body || '{}');
        const action = getAction(event, body);

        // ====================================================================
        // ACTION: get (配送先デフォルト情報の取得)
        // --------------------------------------------------------------------
        // 目的: ログインユーザーのIDに紐付く「受取人」(RECEIVER) メタデータを取得。
        // DB上の camelCase (zipCode) を API仕様の snake_case (zip_code) に変換します。
        // ====================================================================
        if (action === 'get') {
            const getRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `USER#${userId}`, SK: 'RECEIVER' }
            }));

            if (!getRes.Item) {
                return successResponse({ receiver_info: null });
            }

            const item = getRes.Item;
            // DB(camelCase) -> API(snake_case) への変換
            const receiver_info = {
                name: item.name,
                zip_code: item.zipCode || item.zip_code, // 移行期対応
                address: item.address,
                phone: item.phone,
                email: item.email
            };

            return successResponse({ receiver_info });
        }

        // ====================================================================
        // ACTION: update (配送先デフォルト情報の更新)
        // --------------------------------------------------------------------
        // 目的: ユーザーの配送先情報を保存または部分更新（Upsert）。
        // API仕様の snake_case (zip_code) を DB上の camelCase (zipCode) に変換して保存します。
        // ====================================================================
        if (action === 'update') {
            const raw_receiver_info = body.receiverInfo || body.receiver_info;
            if (!raw_receiver_info) return errorResponse(400, 'Missing receiver_info data');

            // API Payload -> DB Attributes への変換
            const dbFields: any = { ...raw_receiver_info };
            if (raw_receiver_info.zip_code !== undefined) {
                dbFields.zipCode = raw_receiver_info.zip_code;
                delete dbFields.zip_code;
            }

            /**
             * 【属性抽出とフィルタリング】
             * 意図しないキー値（PK, SK等）の混入を防ぐため、許可されたフィールドのみを抽出。
             */
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
