/**
 * @file ADDRESS_REGISTRATION_CONFIRMATION.ts (en)
 * @description Confirmation of address registration for the recipient (English)
 * @placeholders
 *  - {{baseUrl}}: App base URL
 *  - {{qr_id}}: QR code ID
 *  - {{pin}}: Access PIN
 *  - {{name}}: Name
 *  - {{zip_code}}: Postal code
 *  - {{address}}: Address
 *  - {{phone}}: Phone number
 *  - {{email}}: Email address
 *  - {{preferred_date}}: Preferred delivery date
 *  - {{preferred_time}}: Preferred delivery time
 */
export const body = `
Address registration completed.
Please wait for the item to be shipped.

Registered delivery information:
Name: {{name}}
Postal Code: {{zip_code}}
Address: {{address}}
Phone: {{phone}}
Email: {{email}}
Preferred Delivery Date: {{preferred_date}}
Preferred Delivery Time: {{preferred_time}}

Check here:
{{baseUrl}}/receive/{{qr_id}}
PIN: {{pin}}
`.trim();
