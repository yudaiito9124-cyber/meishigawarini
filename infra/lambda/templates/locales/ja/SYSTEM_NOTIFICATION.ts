export const body = `
{{message}}
----------------------------------
確認はこちら:
{{baseUrl}}/receive/{{qr_id}}
PIN: {{pin}}
`.trim();
