/**
 * @file SYSTEM_NOTIFICATION.ts (en)
 * @description System notification message (English)
 * @placeholders
 *  - {{message}}: Notification message
 *  - {{baseUrl}}: App base URL
 *  - {{qr_id}}: QR code ID
 *  - {{pin}}: Access PIN
 */
export const body = `
{{message}}
----------------------------------
Check here:
{{baseUrl}}/receive/{{qr_id}}
PIN: {{pin}}
`.trim();
