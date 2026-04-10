/**
 * @file SHIPPING_NOTIFICATION.ts (ja)
 * @description 受取人向けの発送完了通知（日本語）
 * @placeholders
 *  - {{baseUrl}}: アプリのベースURL
 *  - {{qr_id}}: QRコード固有のID
 *  - {{pin}}: アクセス用PINコード
 */
export const body = `
商品の発送が完了しました。
到着まで今しばらくお待ちください。

また、受取り後は、「受け取り完了ボタン」の押下にご協力ください。

追跡番号の確認・受け取り完了の報告はこちら:
{{baseUrl}}/receive/{{qr_id}}
PIN: {{pin}}
`.trim();
