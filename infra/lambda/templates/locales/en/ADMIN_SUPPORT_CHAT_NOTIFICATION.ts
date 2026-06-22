/**
 * @file ADMIN_SUPPORT_CHAT_NOTIFICATION.ts
 * @role For System Administrators: Email body template for new support chat notification (English)
 * @responsibility
 *  - Defines the email body template used to notify configured system administrators when a new support chat is initiated by a shop or user.
 */

export const body = `Dear System Administrator,

A new support inquiry (chat) has been created.

[Inquiry Details]
Chat ID: {{chatId}}
Type: {{chatType}}
Initiator: {{initiatorId}}

[Content]
{{message}}

Please review the details and respond from the System Admin dashboard.

[System Admin Dashboard (Inquiry List)]
{{baseUrl}}/admin

--
Meishi Gawarini
{{baseUrl}}
`;
