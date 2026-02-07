
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { createMessageNotificationEmail } from './templates/email';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const ses = new SESClient({});
const TABLE_NAME = process.env.TABLE_NAME || '';
const SES_SENDER_EMAIL = process.env.SES_SENDER_EMAIL;

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
            const { pin, username, message, type, email, locale } = body; // Added locale

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

                // Use ADD to manage unique set of emails AND Update preferences
                // We need two operations or a clever update expression.
                // It's cleaner to just do one update with both.
                // SET email_preferences.#email = :locale ADD notification_emails :new_email
                // But #email needs ExpressionAttributeNames because email contains @ which is fine? No, dot is special.

                const safeEmailKey = email.replace(/[^a-zA-Z0-9]/g, '_'); // Just for key name safety if needed, but actually Map keys in DynamoDB are strings.
                // However, nested path syntax uses dots. better to use ExpressionAttributeNames for the email key.

                const lang = locale === 'ja' ? 'ja' : 'en'; // Default to en if not ja

                // 1. Ensure email_preferences map exists (and add email to set)
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
                    UpdateExpression: 'ADD notification_emails :new_email SET email_preferences = if_not_exists(email_preferences, :empty_map)',
                    ExpressionAttributeValues: {
                        ':new_email': new Set([email]),
                        ':empty_map': {}
                    }
                }));

                // 2. Set the language preference for this specific email
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
                    UpdateExpression: 'SET email_preferences.#em = :lang',
                    ExpressionAttributeNames: {
                        '#em': email
                    },
                    ExpressionAttributeValues: {
                        ':lang': lang
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
                const getRes = await ddb.send(new GetCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
                    ProjectionExpression: 'notification_emails, email_preferences'
                }));

                if (getRes.Item && getRes.Item.notification_emails) {
                    const recipients = Array.from(new Set(getRes.Item.notification_emails as string[]));
                    const preferences = getRes.Item.email_preferences || {};

                    const sendPromises = recipients.map(emailTo => {
                        const langLength = (preferences[emailTo] === 'en') ? 'en' : 'ja';

                        const { subject, bodyText } = createMessageNotificationEmail({
                            username,
                            message,
                            uuid,
                            pin,
                            lang: langLength
                        });

                        return ses.send(new SendEmailCommand({
                            Source: SES_SENDER_EMAIL,
                            Destination: { ToAddresses: [emailTo] },
                            Message: {
                                Subject: { Data: subject },
                                Body: { Text: { Data: bodyText } }
                            }
                        }));
                    });

                    await Promise.all(sendPromises);
                }
            } catch (e) {
                console.error('Failed to send notification emails:', e);
                // Do not fail the whole process if email fails
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
