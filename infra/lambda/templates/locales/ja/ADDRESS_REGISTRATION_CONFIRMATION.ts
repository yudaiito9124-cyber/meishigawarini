export const body = `
住所の登録が完了しました。
商品の発送まで今しばらくお待ちください。

荷物の状態はこちら:
{{baseUrl}}/receive/{{uuid}}
PIN: {{pin}}
`.trim();
