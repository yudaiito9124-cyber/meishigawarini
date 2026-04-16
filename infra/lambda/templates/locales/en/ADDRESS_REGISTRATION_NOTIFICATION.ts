/**
 * @file ADDRESS_REGISTRATION_NOTIFICATION.ts (en)
 * @description Notification to the shop owner about recipient address registration (English)
 * @placeholders
 *  - {{shopName}}: Shop name
 *  - {{productName}}: Product name
 *  - {{qr_id}}: Order ID (QR_ID)
 *  - {{timestamp}}: Registration time
 *  - {{baseUrl}}: App base URL
 *  - {{shopId}}: Shop ID
 */
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
