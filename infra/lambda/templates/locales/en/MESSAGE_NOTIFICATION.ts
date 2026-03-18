export const body = `
You have a new message from {{username}}.
----------------------------------
{{message}}
----------------------------------

Check here:
{{baseUrl}}/receive/{{uuid}}
PIN: {{pin}}
`.trim();
