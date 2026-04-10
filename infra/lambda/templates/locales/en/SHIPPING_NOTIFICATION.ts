/**
 * @file SHIPPING_NOTIFICATION.ts (en)
 * @description Notification of shipping completion for the recipient (English)
 * @placeholders
 *  - {{baseUrl}}: App base URL
 *  - {{qr_id}}: QR code ID
 *  - {{pin}}: Access PIN
 */
export const body = `
Your item has been shipped.
Please wait for it to arrive.

Check status here:
{{baseUrl}}/receive/{{qr_id}}
PIN: {{pin}}
`.trim();
