/**
 * @file SYSTEM_NOTIFICATION.ts (ja)
 * @description システムからの任意通知（日本語）
 * @placeholders
 *  - {{message}}: 通知メッセージ内容
 *  - {{baseUrl}}: アプリのベースURL
 *  - {{qr_id}}: QRコード固有のID
 *  - {{pin}}: アクセス用PINコード
 */
export const body = `
{{message}}
----------------------------------
確認はこちら:
{{baseUrl}}/receive/{{qr_id}}
PIN: {{pin}}
`.trim();
