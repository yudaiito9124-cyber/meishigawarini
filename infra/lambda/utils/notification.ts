
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { createMessageNotificationEmail } from '../templates/email';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const ses = new SESClient({});

const TABLE_NAME = process.env.TABLE_NAME || '';
const SES_SENDER_EMAIL = process.env.SES_SENDER_EMAIL || '';
const SYSTEM_USERNAME = 'System';

/**
 * Sends a system notification message to the chat and emails the recipients.
 * @param qr_id The UUID of the QR code/Order
 * @param message The message content to send
 * @param pin The PIN code (required for the email template)
 */
export async function sendSystemNotification(qr_id: string, message: string, pin: string) {
    if (!TABLE_NAME) {
        console.error("TABLE_NAME is not defined");
        return;
    }

    try {
        console.log(`Sending system notification for ${qr_id}: ${message}`);

        // 1. Get Chat details (recipients)
        const chatRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${qr_id}`, SK: 'CHAT' }
        }));

        const emailsSet = chatRes.Item?.notification_emails;
        let recipients: string[] = [];
        if (emailsSet) {
            recipients = Array.from(emailsSet as Set<string>);
        }

        if (recipients.length === 0) {
            console.log("No recipients found for notification.");
            return;
        }

        // 2. Add System Message to Chat
        const newMessage = {
            id: crypto.randomUUID(),
            username: SYSTEM_USERNAME,
            message,
            ts_created_at: new Date().toISOString()
        };

        // We use UpdateExpression to append the message.
        // Assuming the CHAT item exists (it should if emails exist, or at least created on subscribe)
        // If it doesn't exist, this might fail if we don't init `messages`. 
        // But `list_append(if_not_exists` handles empty list.
        // However, if the KEY doesn't exist at all? UpdateCommand creates it? Yes.
        await ddb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${qr_id}`, SK: 'CHAT' },
            UpdateExpression: 'SET messages = list_append(if_not_exists(messages, :empty_list), :new_msg)',
            ExpressionAttributeValues: {
                ':empty_list': [],
                ':new_msg': [newMessage]
            }
        }));

        // 2. Send Emails (Fire and Forget)
        try {
            const getRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${qr_id}`, SK: 'CHAT' },
                ProjectionExpression: 'notification_emails, email_preferences' // Fetch preferences
            }));

            if (getRes.Item && getRes.Item.notification_emails) {
                const recipients = Array.from(new Set(getRes.Item.notification_emails as string[]));
                const preferences = getRes.Item.email_preferences || {};

                const sendPromises = recipients.map(email => {
                    const lang = (preferences[email] === 'en') ? 'en' : 'ja';

                    // Adjust message based on language if it's the specific DeliveryCompleted system message
                    // However, the caller passes the message. The caller previously passed "Bilingual message".
                    // Ideally, the caller should pass a key or we interpret it here?
                    // Or, simply, if the message is "DeliveryCompleted", we select the right text?
                    // The current implementation in recipient-completed.ts passes "DeliveryCompleted".
                    // So we can map it here.

                    let displayMessage = message;
                    const { subject, bodyText } = createMessageNotificationEmail({
                        username: SYSTEM_USERNAME, // We might want to localize this too? "System" vs "システム通知"
                        message: displayMessage,
                        uuid: qr_id,
                        pin,
                        lang
                    });

                    return ses.send(new SendEmailCommand({
                        Source: SES_SENDER_EMAIL,
                        Destination: { ToAddresses: [email] },
                        Message: {
                            Subject: { Data: subject },
                            Body: { Text: { Data: bodyText } }
                        }
                    }));
                });

                await Promise.all(sendPromises);
                console.log("System notification emails sent successfully.");
            } else {
                console.log("No recipients found for notification emails.");
            }
        } catch (e) {
            console.error('Failed to send notification emails:', e);
            // Do not fail the whole process if email fails
        }

        console.log("System notification process completed.");

    } catch (err) {
        console.error("Failed to send system notification:", JSON.stringify(err, null, 2));
    }
}
