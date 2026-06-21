/**
 * @file ADDRESS_REGISTRATION_CONFIRMATION.ts (ja)
 * @description 受取人向けの住所登録完了通知（日本語）
 * @placeholders
 *  - {{baseUrl}}: アプリのベースURL
 *  - {{qr_id}}: QRコード固有のID
 *  - {{pin}}: アクセス用PINコード
 *  - {{name}}: お名前
 *  - {{zip_code}}: 郵便番号
 *  - {{address}}: 住所
 *  - {{phone}}: 電話番号
 *  - {{email}}: メールアドレス
 *  - {{preferred_date}}: お届け希望日
 *  - {{preferred_time}}: お届け希望時間帯
 */
export const body = `
住所の登録が完了しました。
商品の発送まで今しばらくお待ちください。

登録されたお届け先情報は以下の通りです。
お名前: {{name}}
郵便番号: {{zip_code}}
ご住所: {{address}}
電話番号: {{phone}}
メールアドレス: {{email}}
配送希望日: {{preferred_date}}
配送希望時間帯: {{preferred_time}}

荷物の状態はこちら:
{{baseUrl}}/receive/{{qr_id}}
PIN: {{pin}}
`.trim();
