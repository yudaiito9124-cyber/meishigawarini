/**
 * @file ADDRESS_REGISTRATION_NOTIFICATION.ts (ja)
 * @description ショップオーナー向けの受取人住所登録通知（日本語）
 * @placeholders
 *  - {{shopName}}: ショップ名
 *  - {{productName}}: 商品名
 *  - {{qr_id}}: 注文ID (QR_ID)
 *  - {{baseUrl}}: アプリのベースURL
 *  - {{shopId}}: ショップID
 */
export const body = `
ショップオーナー様

あなたのショップ「{{shopName}}」の商品にお届け先住所が登録されました。

商品名: {{productName}}
注文ID: {{qr_id}}

管理画面から注文詳細を確認し、発送準備を進めてください。

管理画面:
{{baseUrl}}/shop/{{shopId}}
`.trim();
