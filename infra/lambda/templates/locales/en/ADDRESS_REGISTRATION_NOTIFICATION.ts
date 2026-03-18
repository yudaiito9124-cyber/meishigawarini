export const body = `
Dear Shop Owner,

A recipient has registered an address for a product in your shop "{{shopName}}".

Product: {{productName}}
Order ID: {{qr_id}}
Time: {{timestamp}}

Please check the order details in the admin panel and prepare for shipping.

Admin Panel:
{{baseUrl}}/shop/{{shopId}}
`.trim();
