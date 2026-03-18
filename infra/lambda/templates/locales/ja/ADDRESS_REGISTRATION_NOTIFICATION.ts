export const body = `
ショップオーナー様

あなたのショップ「{{shopName}}」の商品にお届け先住所が登録されました。

商品名: {{productName}}
注文ID: {{qr_id}}
登録日時: {{timestamp}}

管理画面から注文詳細を確認し、発送準備を進めてください。

管理画面:
{{baseUrl}}/shop/{{shopId}}
`.trim();
