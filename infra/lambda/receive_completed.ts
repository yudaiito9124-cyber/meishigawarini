/**
 * 概要: ギフト受取完了の報告
 * 詳細: ユーザーがギフトを受け取ったことを報告し、ステータスを COMPLETED (完了) に変更します。
 * エンドポイント: POST /receive/completed
 * リクエストボディ:
 *  - qr_id: ギフト（QR）のUUID (必須)
 *  - pin_code: 4桁のPINコード (必須)
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, TransactWriteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { sendSystemNotification } from './utils/notification';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };
        }

        const body = JSON.parse(event.body || '{}');
        const { qr_id, pin_code } = body;

        if (!qr_id || !pin_code) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing required fields' }) };
        }

        // 【DB操作: GetItem】
        // - 目的: 指定されたQRコードの状態確認。すでに発送済み(SHIPPED)であるか、PINが一致しているかを検証
        // - テーブル: TABLE_NAME
        // - リクエストキー: { PK: `QR#${qr_id}`, SK: 'METADATA' }
        // - 取得カラム: ALL (status, pin 等)
        const getRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${qr_id}`, SK: 'METADATA' }
        }));

        if (!getRes.Item) {
            return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'QR Code not found' }) };
        }

        if (getRes.Item.status !== 'SHIPPED') {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'QR Code is not shipped' }) };
        }

        if (getRes.Item.pin !== pin_code) {
            return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid PIN' }) };
        }

        // 【DB操作: TransactWriteItems】
        // - 目的: 商品受領に伴い、QRコードのステータスを「完了(COMPLETED)」へアトミックに移行
        // - テーブル: TABLE_NAME
        // - 処理: { PK: `QR#${qr_id}`, SK: 'METADATA' } の status, GSI1_PK, ts_completed_at を更新
        // - 条件: 別のプロセスによって status が SHIPPED 以外に書き換えられていないこと
        await ddb.send(new TransactWriteCommand({
            TransactItems: [
                {
                    Update: {
                        TableName: TABLE_NAME,
                        Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
                        UpdateExpression: 'SET #status = :completed, GSI1_PK = :gsi_pk, ts_completed_at = :now, ts_updated_at = :now',
                        ConditionExpression: '#status = :shipped',
                        ExpressionAttributeNames: { '#status': 'status' },
                        ExpressionAttributeValues: {
                            ':completed': 'COMPLETED',
                            ':shipped': 'SHIPPED',
                            ':gsi_pk': 'QR#COMPLETED',
                            ':now': new Date().toISOString()
                        }
                    }
                }
            ]
        }));

        // 通知送信 (ショップ管理者に受取完了を知らせる)
        try {
            await sendSystemNotification(qr_id, 'DeliveryCompleted', pin_code);
        } catch (e) {
            console.error('Notification failed', e);
        }

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Gift received successfully', order_id: `ORDER#${qr_id}` })
        };

    } catch (error: any) {
        console.error(error);
        if (error.name === 'TransactionCanceledException') return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ message: 'Already completed' }) };
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error' }) };
    }
};
