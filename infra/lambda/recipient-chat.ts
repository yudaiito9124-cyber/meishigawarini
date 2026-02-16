
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { createMessageNotificationEmail } from './templates/email';
import { sendEmail } from './utils/email-client';
import { isLocked, getRateLimitUpdate, getResetRateLimitUpdate } from './utils/rate-limit';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || '';

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
            const { pin, username, message, type, email, locale } = body;

            // 1. Verify PIN (Required for both Subscribe and Message)
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

            // Check Lock
            if (isLocked(getRes.Item)) {
                return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'Too many attempts. Please try again later.' }) };
            }

            const item = getRes.Item;

            if (item.pin !== pin) {
                const { UpdateExpression, ExpressionAttributeValues, ExpressionAttributeNames } = getRateLimitUpdate(item);
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `QR#${uuid}`, SK: 'METADATA' },
                    UpdateExpression,
                    ExpressionAttributeValues,
                    ExpressionAttributeNames
                }));
                return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid PIN' }) };
            }

            // === HANDLE SUBSCRIPTION ===
            if (type === 'subscribe') {
                if (!email) {
                    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing email' }) };
                }

                const lang = locale === 'ja' ? 'ja' : 'en';

                // reset rate limit implicitly by removing fields
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
                    UpdateExpression: 'ADD notification_emails :new_email SET email_preferences = if_not_exists(email_preferences, :empty_map)',
                    ExpressionAttributeValues: {
                        ':new_email': new Set([email]),
                        ':empty_map': {}
                    }
                }));

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

                // Also Reset Rate Limit on METADATA if needed
                if (item.failed_attempts || item.locked_until) {
                    try {
                        const { UpdateExpression, ExpressionAttributeNames } = getResetRateLimitUpdate();
                        await ddb.send(new UpdateCommand({
                            TableName: TABLE_NAME,
                            Key: { PK: `QR#${uuid}`, SK: 'METADATA' },
                            UpdateExpression,
                            ExpressionAttributeNames
                        }));
                    } catch (e) {
                        console.error("Failed to reset rate limit on subscribe", e);
                    }
                }

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

            if (username === 'System') {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid username' }) };
            }

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

            // Also Reset Rate Limit on METADATA if needed
            if (item.failed_attempts || item.locked_until) {
                try {
                    const { UpdateExpression, ExpressionAttributeNames } = getResetRateLimitUpdate();
                    await ddb.send(new UpdateCommand({
                        TableName: TABLE_NAME,
                        Key: { PK: `QR#${uuid}`, SK: 'METADATA' },
                        UpdateExpression,
                        ExpressionAttributeNames
                    }));
                } catch (e) {
                    console.error("Failed to reset rate limit on message", e);
                }
            }

            // 3. Send Notifications
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

                        return sendEmail({
                            to: [emailTo],
                            subject: subject,
                            text: bodyText
                        });
                    });

                    await Promise.all(sendPromises);
                }
            } catch (e) {
                console.error('Failed to send notification emails:', e);
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

            // Check Lock
            if (isLocked(getMeta.Item)) {
                return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'Too many attempts. Please try again later.' }) };
            }

            if (getMeta.Item.pin !== pin) {
                const { UpdateExpression, ExpressionAttributeValues, ExpressionAttributeNames } = getRateLimitUpdate(getMeta.Item);
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `QR#${uuid}`, SK: 'METADATA' },
                    UpdateExpression,
                    ExpressionAttributeValues,
                    ExpressionAttributeNames
                }));
                return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid PIN' }) };
            }

            // Success Reset
            if (getMeta.Item.failed_attempts || getMeta.Item.locked_until) {
                try {
                    const { UpdateExpression, ExpressionAttributeNames } = getResetRateLimitUpdate();
                    await ddb.send(new UpdateCommand({
                        TableName: TABLE_NAME,
                        Key: { PK: `QR#${uuid}`, SK: 'METADATA' },
                        UpdateExpression,
                        ExpressionAttributeNames
                    }));
                } catch (e) {
                    console.error("Failed to reset rate limit on GET", e);
                }
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
