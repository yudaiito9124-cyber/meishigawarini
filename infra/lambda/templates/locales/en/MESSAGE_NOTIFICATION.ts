/**
 * @file MESSAGE_NOTIFICATION.ts (en)
 * @description Template for new message notifications (English)
 * @placeholders
 *  - {{username}}: Sender's name
 *  - {{message}}: Message content
 *  - {{baseUrl}}: App base URL
 *  - {{qr_id}}: QR code ID
 *  - {{pin}}: Access PIN
 */
export const body = `
You have a new message from {{username}}.
----------------------------------
{{message}}
----------------------------------

Check here:
{{baseUrl}}/receive/{{qr_id}}
PIN: {{pin}}
`.trim();
