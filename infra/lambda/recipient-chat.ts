
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { createMessageNotificationEmail } from './templates/email';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const ses = new SESClient({});
const TABLE_NAME = process.env.TABLE_NAME || '';
const SOURCE_EMAIL = process.env.SOURCE_EMAIL || 'noreply@meishigawarini.com';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') {
            return { statusCode: 200, headers: corsHeaders, body: '' };
        }

        const { uuid } = event.pathParameters || {};
        if (!uuid) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing UUID' }) };
        }

        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { pin, username, message, type, email } = body; // Added type & email

            // 1. Verify PIN (Required for both Subscribe and Message)
            // For subscribe, we might need PIN to authorized. Yes.
            if (!pin) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing PIN' }) };
            }

            const getRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${uuid}`, SK: 'METADATA' }
            }));

            if (!getRes.Item) {
                return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'QR Code not found' }) };
            }

            if (getRes.Item.pin !== pin) {
                return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid PIN' }) };
            }

            // === HANDLE SUBSCRIPTION ===
            if (type === 'subscribe') {
                if (!email) {
                    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing email' }) };
                }

                // Use ADD to manage unique set of emails
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
                    UpdateExpression: 'ADD notification_emails :new_email',
                    ExpressionAttributeValues: {
                        ':new_email': new Set([email])
                    }
                }));

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: 'Subscribed successfully' })
                };
            }

            // === HANDLE MESSAGE ===
            if (!username || !message) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing required fields' }) };
            }

            // Security: Prevent impersonation of System
            if (username === 'System') {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid username' }) };
            }

            // 2. Append Message to SK=CHAT
            // Structure: messages: [ { username, message, ts_created_at, id } ]
            const newMessage = {
                id: crypto.randomUUID(),
                username,
                message,
                ts_created_at: new Date().toISOString()
            };

            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
                UpdateExpression: 'SET messages = list_append(if_not_exists(messages, :empty_list), :new_msg)',
                ExpressionAttributeValues: {
                    ':empty_list': [],
                    ':new_msg': [newMessage]
                }
            }));

            // 3. Send Notifications (Fire and forget or await)
            try {
                // Fetch the chat item to get emails
                const chatRes = await ddb.send(new GetCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `QR#${uuid}`, SK: 'CHAT' }
                }));

                const emailsSet = chatRes.Item?.notification_emails;
                let recipients: string[] = [];
                if (emailsSet) {
                    // DynamoDB Set comes as Set or array depending on marshall options. 
                    // DocumentClient usually returns Set object.
                    recipients = Array.from(emailsSet as Set<string>);
                }

                if (recipients.length > 0) {
                    // Construct email content using template
                    const { subject, bodyText } = createMessageNotificationEmail({
                        username,
                        message,
                        uuid,
                        pin
                    });

                    // Send individually to hide other recipients (BCC style or individual emails)
                    // SES Limit: 50 recipients per message if using Bcc/To.
                    // We'll send one email with Bcc if many, or loop.
                    // Looping is safer for "To" field personalization if needed, but Bcc is cheaper.
                    // Let's loop for now as volume is low.

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
                }
            } catch (err) {
                console.error("Failed to send notifications:", JSON.stringify(err, null, 2));
                // Don't fail the request just because email failed
            }

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Message posted', data: newMessage })
            };
        }

        if (event.httpMethod === 'GET') {
            const pin = event.queryStringParameters?.pin;
            if (!pin) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing PIN' }) };
            }

            // 1. Verify PIN (Check METADATA first)
            const getMeta = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${uuid}`, SK: 'METADATA' }
            }));

            if (!getMeta.Item) {
                return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'QR Code not found' }) };
            }

            if (getMeta.Item.pin !== pin) {
                return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid PIN' }) };
            }

            // 2. Get Messages
            const getChat = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${uuid}`, SK: 'CHAT' }
            }));

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({ messages: getChat.Item?.messages || [] })
            };
        }

        return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };

    } catch (error: any) {
        console.error(error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Internal Server Error' })
        };
    }
};
