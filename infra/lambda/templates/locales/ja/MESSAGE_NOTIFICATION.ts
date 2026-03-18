export const body = `
{{username}} さんからメッセージが届きました。
----------------------------------
{{message}}
----------------------------------

確認はこちら:
{{baseUrl}}/receive/{{uuid}}
PIN: {{pin}}
`.trim();
