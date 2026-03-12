
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { createMessageNotificationEmail } from './templates/email';
import { sendEmail } from './utils/email-client';
import { isLocked, getRateLimitUpdate, getResetRateLimitUpdate } from './utils/rate-limit';
import { signUrlIfS3, stripSignature, signUrlsInHtml, deleteFileByUrl, copyS3Object, stripSignaturesInHtml } from './utils/s3';

import * as crypto from 'crypto';
import { generateId } from './utils/id';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true,
        convertEmptyValues: true
    }
});
const TABLE_NAME = process.env.TABLE_NAME || '';
const BUCKET_NAME = process.env.BUCKET_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,GET'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {

        const { uuid } = event.pathParameters || {};
        if (!uuid) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing UUID' }) };
        }

        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { pin, username, message, type, email, locale, file_url, file_name, file_type, file_size } = body;

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

            // === HANDLE SENDER INFO UPDATE ===
            if (type === 'update_sender_info') {
                const { sender_info } = body;
                if (!sender_info) {
                    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing sender_info' }) };
                }

                const res = await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
                    UpdateExpression: 'SET sender_info = :info',
                    ExpressionAttributeValues: {
                        ':info': {
                            ...sender_info,
                            card_image_url: stripSignature(sender_info.card_image_url),
                            html_image_urls: (sender_info.html_image_urls || []).map((url: string) => stripSignature(url)),
                            detail_html: stripSignaturesInHtml(sender_info.detail_html, BUCKET_NAME)
                        }
                    },
                    ReturnValues: 'ALL_OLD'
                }));

                // Mailing list management for sender email
                const oldSenderInfo = res.Attributes?.sender_info;
                const oldEmail = oldSenderInfo?.email;
                const newEmail = sender_info.email;

                if (oldEmail !== newEmail) {
                    if (oldEmail) {
                        try {
                            await ddb.send(new UpdateCommand({
                                TableName: TABLE_NAME,
                                Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
                                UpdateExpression: 'DELETE notification_emails :old_email REMOVE email_preferences.#em',
                                ExpressionAttributeNames: { '#em': oldEmail },
                                ExpressionAttributeValues: { ':old_email': new Set([oldEmail]) }
                            }));
                        } catch (e) {
                            console.error("Failed to remove old sender email from mailing list:", e);
                        }
                    }
                    if (newEmail) {
                        try {
                            const lang = locale === 'ja' ? 'ja' : 'en';
                            await ddb.send(new UpdateCommand({
                                TableName: TABLE_NAME,
                                Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
                                UpdateExpression: 'ADD notification_emails :new_email SET email_preferences = if_not_exists(email_preferences, :empty_map)',
                                ExpressionAttributeValues: {
                                    ':new_email': new Set([newEmail]),
                                    ':empty_map': {}
                                }
                            }));
                            await ddb.send(new UpdateCommand({
                                TableName: TABLE_NAME,
                                Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
                                UpdateExpression: 'SET email_preferences.#em = :lang',
                                ExpressionAttributeNames: { '#em': newEmail },
                                ExpressionAttributeValues: { ':lang': lang }
                            }));
                        } catch (e) {
                            console.error("Failed to add new sender email to mailing list:", e);
                        }
                    }
                }

                // Delete old image from S3 if it exists and has changed
                const oldImageUrl = oldSenderInfo?.card_image_url;
                const newImageUrl = stripSignature(sender_info.card_image_url);

                if (oldImageUrl && oldImageUrl !== newImageUrl) {
                    await deleteFileByUrl(oldImageUrl, BUCKET_NAME);
                }

                const oldHtmlUrls = oldSenderInfo?.html_image_urls || [];
                const newHtmlUrls = (sender_info.html_image_urls || []).map((url: string) => stripSignature(url));
                const toDelete = oldHtmlUrls.filter((url: string) => !newHtmlUrls.includes(url));
                for (const url of toDelete) {
                    await deleteFileByUrl(url, BUCKET_NAME);
                }

                // Explicitly delete URLs tracked by frontend
                if (body.deleted_html_image_urls && Array.isArray(body.deleted_html_image_urls)) {
                    for (const url of body.deleted_html_image_urls) {
                        const cleanUrl = stripSignature(url);
                        if (cleanUrl && !toDelete.includes(cleanUrl)) {
                            await deleteFileByUrl(cleanUrl, BUCKET_NAME);
                        }
                    }
                }

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: 'Sender info updated', data: sender_info })
                };
            }

            // === HANDLE DELETE IMAGES ===
            if (type === 'delete_images') {
                const { urls } = body;
                if (!urls || !Array.isArray(urls)) {
                    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing urls' }) };
                }

                for (const url of urls) {
                    const cleanUrl = stripSignature(url);
                    // Security Check: Only allow if it belongs to this qrcode and bucket
                    if (cleanUrl && cleanUrl.includes(BUCKET_NAME) && (cleanUrl.includes(`qrcode/${uuid}/`) || cleanUrl.includes(`user/`))) {
                        await deleteFileByUrl(cleanUrl, BUCKET_NAME);
                    }
                }
                return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Images deleted' }) };
            }

            // === HANDLE SAVE AS NEW USER ===
            if (type === 'save_as_new_user') {
                const { sender_info } = body;
                if (!sender_info) {
                    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing sender_info' }) };
                }

                const userid = generateId();

                const copyFile = async (url: string) => {
                    if (!url || !url.includes(BUCKET_NAME)) return url;
                    try {
                        const urlObj = new URL(url);
                        let sourceKey = decodeURIComponent(urlObj.pathname.substring(1));
                        if (sourceKey.startsWith(`${BUCKET_NAME}/`)) {
                            sourceKey = sourceKey.substring(BUCKET_NAME.length + 1);
                        }
                        const filename = sourceKey.split('/').pop();
                        const destKey = `user/${userid}/usercontent/${filename}`;
                        await copyS3Object(BUCKET_NAME, sourceKey, destKey);

                        const region = process.env.AWS_REGION || 'ap-northeast-1';
                        return `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${destKey}`;
                    } catch (e) {
                        console.error("Failed to copy S3 object:", url, e);
                        return url;
                    }
                };

                let senderInfoStr = JSON.stringify(sender_info);
                const urlRegex = /https?:\/\/[^"'\s\\]+/g;
                const matches = senderInfoStr.match(urlRegex) || [];
                const uniqueUrls = [...new Set(matches)].filter((url) => url.includes(BUCKET_NAME));

                const urlMap = new Map<string, string>();
                for (const url of uniqueUrls) {
                    const newUrl = await copyFile(url);
                    urlMap.set(url, newUrl);
                }

                for (const [oldUrl, newUrl] of urlMap.entries()) {
                    senderInfoStr = senderInfoStr.split(oldUrl).join(newUrl);
                }

                const newSenderInfo = JSON.parse(senderInfoStr);

                const keys = Object.keys(newSenderInfo);
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `USER#${userid}`, SK: 'SENDER' },
                    UpdateExpression: 'SET ' + ['#ts = :ts', ...keys.map((_, i) => `#field${i} = :val${i}`)].join(', '),
                    ExpressionAttributeNames: {
                        '#ts': 'ts_created_at',
                        ...keys.reduce((acc, k, i) => ({ ...acc, [`#field${i}`]: k }), {})
                    },
                    ExpressionAttributeValues: {
                        ':ts': new Date().toISOString(),
                        ...keys.reduce((acc, k, i) => ({ ...acc, [`:val${i}`]: newSenderInfo[k] }), {})
                    }
                }));

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: 'User created successfully', userid })
                };
            }
            if (type === 'load_from_id') {
                const { id } = body;
                if (!id || typeof id !== 'string') {
                    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing or invalid ID' }) };
                }

                // Format: USER#[uuid], SENDER
                const pk = id;
                const sk = 'SENDER';

                const getRes = await ddb.send(new GetCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: pk, SK: sk }
                }));

                if (!getRes.Item) {
                    return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'User data not found' }) };
                }

                const sender_info = { ...getRes.Item };
                delete sender_info.PK;
                delete sender_info.SK;

                // Sign URLs
                if (sender_info.card_image_url) {
                    sender_info.card_image_url = await signUrlIfS3(sender_info.card_image_url, BUCKET_NAME);
                }
                if (sender_info.detail_html) {
                    sender_info.detail_html = await signUrlsInHtml(sender_info.detail_html, BUCKET_NAME);
                }
                if (sender_info.html_image_urls && Array.isArray(sender_info.html_image_urls)) {
                    sender_info.html_image_urls = await Promise.all(
                        sender_info.html_image_urls.map((url: string) => signUrlIfS3(url, BUCKET_NAME))
                    );
                }

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({ sender_info })
                };
            }

            // === HANDLE MESSAGE ===
            if (!username || (!message && !file_url)) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing required fields' }) };
            }

            if (username === 'System') {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid username' }) };
            }

            const newMessage: any = {
                id: generateId(),
                username,
                message,
                ts_created_at: new Date().toISOString()
            };

            if (file_url) {
                newMessage.file_url = stripSignature(file_url);
                newMessage.file_name = file_name;
                newMessage.file_type = file_type;
                newMessage.file_size = file_size;
            }

            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
                UpdateExpression: 'SET messages = list_append(if_not_exists(messages, :empty_list), :new_msg) ADD total_size_bytes :size',
                ExpressionAttributeValues: {
                    ':empty_list': [],
                    ':new_msg': [newMessage],
                    ':size': file_size || 0
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

            const messages = getChat.Item?.messages || [];
            const sender_info = getChat.Item?.sender_info || null;

            // Sign URLs for messages
            for (const msg of messages) {
                if (msg.file_url) {
                    msg.file_url = await signUrlIfS3(msg.file_url, BUCKET_NAME);
                }
            }

            // Sign URL for sender info
            if (sender_info) {
                if (sender_info.card_image_url) {
                    sender_info.card_image_url = await signUrlIfS3(sender_info.card_image_url, BUCKET_NAME);
                }
                if (sender_info.detail_html) {
                    sender_info.detail_html = await signUrlsInHtml(sender_info.detail_html, BUCKET_NAME);
                }
                if (sender_info.html_image_urls && Array.isArray(sender_info.html_image_urls)) {
                    sender_info.html_image_urls = await Promise.all(
                        sender_info.html_image_urls.map((url: string) => signUrlIfS3(url, BUCKET_NAME))
                    );
                }
            }

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({
                    messages,
                    total_size_bytes: getChat.Item?.total_size_bytes || 0,
                    sender_info
                })
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
