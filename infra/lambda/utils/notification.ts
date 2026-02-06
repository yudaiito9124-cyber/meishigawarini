
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { createMessageNotificationEmail } from '../templates/email';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const ses = new SESClient({});

const TABLE_NAME = process.env.TABLE_NAME || '';
const SOURCE_EMAIL = process.env.SES_SENDER_EMAIL || '';
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

        // 3. Send Emails
        const { subject, bodyText } = createMessageNotificationEmail({
            username: SYSTEM_USERNAME,
            message,
            uuid: qr_id,
            pin
        });

        const sendPromises = recipients.map(email => {
            return ses.send(new SendEmailCommand({
                Source: SOURCE_EMAIL,
                Destination: { ToAddresses: [email] },
                Message: {
                    Subject: { Data: subject },
                    Body: { Text: { Data: bodyText } }
                }
            }));
        });

        await Promise.allSettled(sendPromises);
        console.log("System notification sent successfully.");

    } catch (err) {
        console.error("Failed to send system notification:", JSON.stringify(err, null, 2));
    }
}
