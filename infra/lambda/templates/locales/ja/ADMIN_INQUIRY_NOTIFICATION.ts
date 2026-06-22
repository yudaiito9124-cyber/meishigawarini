/**
 * @file ADMIN_INQUIRY_NOTIFICATION.ts
 * @role システム管理者宛て：新規問い合わせ通知メールテンプレート（日本語）
 * @responsibility
 *  - ゲスト受取人からショップへの問い合わせが行われた際に、設定されたシステム管理者へ通知するメールの本文テンプレートを定義します。
 */

export const body = `システム管理者様

ショップ宛てにお客様よりお問い合わせがありました。
（このメールはシステム管理者向けに自動送信されています）

【対象ショップ】
{{shopName}} (ID: {{shopId}})

【ショップ管理画面】
{{baseUrl}}/shop/{{shopId}}

【注文ID(QR)】
{{qr_id}}

【お問い合わせ内容】
{{content}}

【返信用メールアドレス】
{{reply_email}}

【電話番号】
{{phone}}

--
名刺代わりに
{{baseUrl}}
`;
