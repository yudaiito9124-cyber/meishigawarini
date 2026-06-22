/**
 * @file ADMIN_CARD_ORDER_NOTIFICATION.ts
 * @role システム管理者宛て：新規物理カード発注通知メールテンプレート（日本語）
 * @responsibility
 *  - ショップから新規物理カード発注が行われた際に、設定されたシステム管理者へ通知するメールの本文テンプレートを定義します。
 */

export const body = `システム管理者様

ショップより新規の物理カード発注がありました。

【対象ショップ】
{{shopName}} (ID: {{shopId}})

【ショップ管理画面】
{{baseUrl}}/shop/{{shopId}}

【発注内容】
注文ID: {{orderId}}
デザインID: {{designId}}
発注枚数: {{quantity}} 枚

システム管理画面から印刷データをダウンロードし、対応を行ってください。

【システム管理画面 (カード発注一覧)】
{{baseUrl}}/admin

--
名刺代わりに
{{baseUrl}}
`;
