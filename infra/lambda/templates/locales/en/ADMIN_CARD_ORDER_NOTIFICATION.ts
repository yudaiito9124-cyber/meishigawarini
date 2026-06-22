/**
 * @file ADMIN_CARD_ORDER_NOTIFICATION.ts
 * @role システム管理者宛て：新規物理カード発注通知メールテンプレート（英語）
 * @responsibility
 *  - ショップから新規物理カード発注が行われた際に、設定されたシステム管理者へ通知するメールの本文テンプレートを定義します。
 */

export const body = `Dear System Administrator,

A new physical card order has been placed by a shop.

[Target Shop]
{{shopName}} (ID: {{shopId}})

[Shop Admin URL]
{{baseUrl}}/shop/{{shopId}}

[Order Details]
Order ID: {{orderId}}
Design ID: {{designId}}
Quantity: {{quantity}} cards

Please download the print data from the system admin dashboard and proceed with printing.

[System Admin Dashboard (Card Orders)]
{{baseUrl}}/admin

--
Meishi Gawarini
{{baseUrl}}
`;
