/**
 * @file ADDRESS_REGISTRATION_CONFIRMATION.ts (en)
 * @description Confirmation of address registration for the recipient (English)
 * @placeholders
 *  - {{baseUrl}}: App base URL
 *  - {{qr_id}}: QR code ID
 *  - {{pin}}: Access PIN
 */
export const body = `
Address registration completed.
Please wait for the item to be shipped.

Check here:
{{baseUrl}}/receive/{{qr_id}}
PIN: {{pin}}
`.trim();
