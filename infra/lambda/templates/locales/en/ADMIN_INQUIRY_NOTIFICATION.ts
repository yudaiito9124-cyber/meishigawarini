/**
 * @file ADMIN_INQUIRY_NOTIFICATION.ts
 * @role システム管理者宛て：新規問い合わせ通知メールテンプレート（英語）
 * @responsibility
 *  - ゲスト受取人からショップへの問い合わせが行われた際に、設定されたシステム管理者へ通知するメールの本文テンプレートを定義します。
 */

export const body = `Dear System Administrator,

A new customer inquiry has been submitted to a shop.
(This is an automated notification for system administrators)

[Target Shop]
{{shopName}} (ID: {{shopId}})

[Shop Admin URL]
{{baseUrl}}/shop/{{shopId}}

[Order ID (QR)]
{{qr_id}}

[Inquiry Content]
{{content}}

[Reply-to Email]
{{reply_email}}

[Phone Number]
{{phone}}

--
Meishi Gawarini
{{baseUrl}}
`;
