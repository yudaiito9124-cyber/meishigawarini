/**
 * @file MESSAGE_NOTIFICATION.ts (ja)
 * @description 新着メッセージ受取通知の本文テンプレート（日本語）
 * @placeholders
 *  - {{username}}: メッセージ送信者の名前
 *  - {{message}}: メッセージ本文
 *  - {{baseUrl}}: アプリのベースURL
 *  - {{qr_id}}: QRコード固有のID
 *  - {{pin}}: アクセス用PINコード
 */
export const body = `
{{username}} さんからメッセージが届きました。
----------------------------------
{{message}}
----------------------------------

確認はこちら:
{{baseUrl}}/receive/{{qr_id}}
PIN: {{pin}}
`.trim();
