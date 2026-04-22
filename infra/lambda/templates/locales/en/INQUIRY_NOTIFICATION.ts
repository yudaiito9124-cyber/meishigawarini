export const body = `Dear Shop Owner ({{shopName}}),

You have received a new inquiry from a customer.


[Shop Admin URL]
{{baseUrl}}/shop/{{shopId}}

[Order ID (QR)]
{{qr_id}}

[Inquiry Content]
{{content}}

[Reply-to Email]
{{reply_email}}

[Phone Number]
{{phone}}

You can contact the customer by replying directly to this email.

--
Meishi Gawarini
{{baseUrl}}
`;
