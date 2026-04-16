/**
 * @file notification.ts
 * @role システム通知連携ユーティリティ
 * @responsibility
 *  - システム上の重要なイベント（発送完了、受取完了等）を、チャット履歴へのログ出力とメール通知の両面から実行します。
 *  - 多言語対応テンプレート（ja/en）を選択し、各ユーザーの優先言語に合わせて通知を配信します。
 * @context
 *  - 注文ステータスの変更時にバックエンドから内部的に呼び出されます。
 *  - 以前構築された `email-client.ts` と `templates/email.ts` の上位層として機能します。
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { sendLocalizedEmail } from '../templates/email';
import { generateId } from './id';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || '';

/** システムメッセージ送信時の固定ユーザー名 */
const SYSTEM_USERNAME = 'System';

/**
 * システム通知をチャット履歴に追加し、通知設定済みのユーザーへメールを送信します。
 * 
 * @param qr_id - 通知対象の QR コード ID（チャットチャンネル ID）。
 * @param message - 通知するメッセージ内容または内部識別子。
 * @param pin - メールテンプレート内でリンク生成に使用する PIN コード。
 */
export async function sendSystemNotification(qr_id: string, message: string, pin: string) {
    if (!TABLE_NAME) {
        console.error("TABLE_NAME is not defined");
        return;
    }

    try {
        console.log(`Sending system notification for ${qr_id}: ${message}`);

        // --------------------------------------------------------------------
        // 1. チャット情報（通知先メールリスト）の取得
        // --------------------------------------------------------------------
        // 目的: 現在このギフト（QR）に対して通知を希望しているメールアドレスの一覧を取得します。
        // PK: QR#<qr_id>, SK: CHAT
        const chatRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${qr_id}`, SK: 'CHAT' }
        }));

        const emailsSet = chatRes.Item?.notification_emails;
        let recipients: string[] = [];
        if (emailsSet) {
            recipients = Array.from(emailsSet as Set<string>);
        }

        if (recipients.length === 0) {
            console.log("No recipients found for notification.");
            // 通知先がいなくても、後の工程でチャット履歴には残すため処理を続行します。
        }

        // --------------------------------------------------------------------
        // 2. チャット履歴へのシステムメッセージ追加
        // --------------------------------------------------------------------
        // 目的: ギフトに関わるユーザーが後から状況を確認できるよう、チャットタイムラインに記録を残します。
        const newMessage = {
            id: generateId(),
            username: SYSTEM_USERNAME,
            message,
            ts_created_at: new Date().toISOString()
        };

        // 既存の messages リストの末尾にアトミックに追記します。
        await ddb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${qr_id}`, SK: 'CHAT' },
            UpdateExpression: 'SET messages = list_append(if_not_exists(messages, :empty_list), :new_msg)',
            ExpressionAttributeValues: {
                ':empty_list': [],
                ':new_msg': [newMessage]
            }
        }));

        // --------------------------------------------------------------------
        // 3. メール配信処理 (Fire and Forget)
        // --------------------------------------------------------------------
        // 目的: 非同期的に全通知先へメールを配送します。
        try {
            // preferences を含めて再確認（最新の状態を取得）
            const getRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${qr_id}`, SK: 'CHAT' },
                ProjectionExpression: 'notification_emails, email_preferences'
            }));

            if (getRes.Item && getRes.Item.notification_emails) {
                const recipients = Array.from(new Set(getRes.Item.notification_emails as string[]));
                const preferences = getRes.Item.email_preferences || {};

                // 全宛先に対して言語設定に基づいたメール送信を並列実行
                const sendPromises = recipients.map(email => {
                    const lang = (preferences[email] === 'en') ? 'en' : 'ja';

                    // 予約語メッセージの翻訳処理
                    let displayMessage = message;
                    if (message === 'DeliveryCompleted') {
                        displayMessage = (lang === 'ja') ? 'ギフトの受け取りが完了しました。' : 'Delivery Completed.';
                    }

                    return sendLocalizedEmail({
                        type: 'SYSTEM_NOTIFICATION',
                        to: email,
                        params: {
                            message: displayMessage,
                            qr_id: qr_id,
                            pin
                        },
                        lang
                    });
                });

                await Promise.all(sendPromises);
                console.log("System notification emails sent successfully.");
            }
        } catch (e) {
            // メール送信の失敗は、システム全体の処理（ステータス更新等）を中断させないよう、ログ出力に留めます。
            console.error('Failed to send notification emails:', e);
        }

        console.log("System notification process completed.");

    } catch (err) {
        console.error("Failed to send system notification:", JSON.stringify(err, null, 2));
    }
}
