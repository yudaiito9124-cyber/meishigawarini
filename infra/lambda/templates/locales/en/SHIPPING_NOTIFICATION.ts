export const body = `
Your item has been shipped.
Please wait for it to arrive.

Check status here:
{{baseUrl}}/receive/{{uuid}}
PIN: {{pin}}
`.trim();
