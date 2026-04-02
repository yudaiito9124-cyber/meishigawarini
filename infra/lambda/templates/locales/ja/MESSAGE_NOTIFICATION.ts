export const body = `
{{username}} さんからメッセージが届きました。
----------------------------------
{{message}}
----------------------------------

確認はこちら:
{{baseUrl}}/receive/{{qr_id}}
PIN: {{pin}}
`.trim();
