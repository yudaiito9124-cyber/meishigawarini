/**
 * 概要: 受取人（Receiver）の共通プロフィール管理
 * 詳細:
 *  - ユーザーがギフトを受け取る際のデフォルトの配送先情報を管理します。
 *  - ここで保存された情報は、ギフト受取時の入力フォームに自動補完（プリフィル）するために使用されます。
 *  - 配送先情報は、氏名、郵便番号、住所、電話番号、メールアドレス等を含みます。
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
        // CORSプリフライトへの即時応答
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const userId = getUserId(event);
        if (!userId) return errorResponse(401, 'Unauthorized');

        const body = JSON.parse(event.body || '{}');
        const action = getAction(event, body);

        // ====================================================================
        // ACTION: receiver_get (配送先デフォルト情報の取得)
        // --------------------------------------------------------------------
        // 目的: ログインユーザーのIDに紐付く「受取人」(RECEIVER) メタデータを取得します。
        // ====================================================================
        if (action === 'receiver_get') {
            /**
             * 【DynamoDB操作: GetCommand】
             * - 指定されたユーザーの固定SKである "RECEIVER" 項目を取得します。
             */
            const getRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `USER#${userId}`, SK: 'RECEIVER' }
            }));

            // 項目が存在しない場合は、初期状態として null を返却します。
            if (!getRes.Item) {
                return successResponse({ receiver_info: null });
            }

            const receiver_info = { ...getRes.Item };
            // 管理用キー(PK, SK)を除外
            delete receiver_info.PK;
            delete receiver_info.SK;

            return successResponse({ receiver_info });
        }

        // ====================================================================
        // ACTION: receiver_update (配送先デフォルト情報の更新)
        // --------------------------------------------------------------------
        // 目的: ユーザーの配送先情報を保存または部分更新（Upsert）します。
        // ====================================================================
        if (action === 'receiver_update') {
            const { receiver_info } = body;
            if (!receiver_info) return errorResponse(400, 'Missing receiver_info data');

            /**
             * 【属性抽出とフィルタリング】
             * フロントエンドから送られてきた各属性を、DynamoDBのUpdateExpression形式に変換します。
             * 意図しないキー値の上書きを防ぐため、システム予約語(PK, SK等)をフィルタリングします。
             */
            const keys = Object.keys(receiver_info).filter(k => !['ts_created_at', 'ts_updated_at', 'PK', 'SK'].includes(k));
            if (keys.length === 0) return errorResponse(400, 'No valid fields to update');

            /**
             * 【DynamoDB操作: UpdateCommand】
             * - 更新日時(ts_updated_at)を確実に更新。
             * - 作成日時(ts_created_at)は項目が未存在の場合のみセット (if_not_exists)。
             * - 各フィールド値を動的に生成されたプレースホルダ(#f, :v)を用いてセットします。
             */
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `USER#${userId}`, SK: 'RECEIVER' },
                UpdateExpression: 'SET #ts_up = :now, #ts_cr = if_not_exists(#ts_cr, :now), ' +
                    keys.map((_, i) => `#f${i} = :v${i}`).join(', '),
                ExpressionAttributeNames: {
                    '#ts_up': 'ts_updated_at',
                    '#ts_cr': 'ts_created_at',
                    ...keys.reduce((acc, k, i) => ({ ...acc, [`#f${i}`]: k }), {})
                },
                ExpressionAttributeValues: {
                    ':now': new Date().toISOString(),
                    ...keys.reduce((acc, k, i) => ({ ...acc, [`:v${i}`]: receiver_info[k] }), {})
                }
            }));

            return successResponse({ message: 'Receiver info updated successfully' });
        }

        // 定義されていないアクションに対するフォールバック
        return errorResponse(400, `Invalid action: ${action}`);

    } catch (error: any) {
        console.error('User receiver error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
