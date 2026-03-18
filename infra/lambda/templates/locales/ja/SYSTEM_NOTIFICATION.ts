export const body = `
{{message}}
----------------------------------
確認はこちら:
{{baseUrl}}/receive/{{uuid}}
PIN: {{pin}}
`.trim();
