/**
 * @file ADDRESS_REGISTRATION_CONFIRMATION.ts (ja)
 * @description 受取人向けの住所登録完了通知（日本語）
 * @placeholders
 *  - {{baseUrl}}: アプリのベースURL
 *  - {{qr_id}}: QRコード固有のID
 *  - {{pin}}: アクセス用PINコード
 */
export const body = `
住所の登録が完了しました。
商品の発送まで今しばらくお待ちください。

荷物の状態はこちら:
{{baseUrl}}/receive/{{qr_id}}
PIN: {{pin}}
`.trim();
