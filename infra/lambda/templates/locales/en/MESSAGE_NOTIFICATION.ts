export const body = `
You have a new message from {{username}}.
----------------------------------
{{message}}
----------------------------------

Check here:
{{baseUrl}}/receive/{{qr_id}}
PIN: {{pin}}
`.trim();
