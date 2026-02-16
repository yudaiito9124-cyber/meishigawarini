
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, TransactWriteCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { sendEmail } from './utils/email-client';
import { isLocked, getRateLimitUpdate } from './utils/rate-limit';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    const { body, ...eventWithoutBody } = event;
    console.log("Recipient Submit Handler Invoked", JSON.stringify(eventWithoutBody));
    try {
        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' };
        }

        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch (e) {
            console.error("JSON Parse Error", e);
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid JSON body' }) };
        }

        const { qr_id, pin_code, shipping_info, password } = body;

        if (!qr_id || !pin_code || !shipping_info) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing required fields' }) };
        }

        const { name, address, zipCode } = shipping_info;
        if (!name || !address || !zipCode) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing required address fields (name, address, zipCode)' }) };
        }

        // 1. Verify QR and PIN
        const getRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `QR#${qr_id}`, SK: 'METADATA' }
        }));

        if (!getRes.Item) {
            return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'QR Code not found' }) };
        }

        if (getRes.Item.status !== 'ACTIVE') {
            const msg = getRes.Item.status === 'EXPIRED' ? 'QR Code has expired' : 'QR Code is not active';
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: msg }) };
        }

        // Check Expiration (Lazy update if caught here)
        if (getRes.Item.ts_expired_at) {
            const now = new Date();
            const expiresAt = new Date(getRes.Item.ts_expired_at);
            if (now > expiresAt) {
                // Determine it is expired
                try {
                    await ddb.send(new UpdateCommand({
                        TableName: TABLE_NAME,
                        Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
                        UpdateExpression: 'SET #status = :expired, GSI1_PK = :gsi_pk, ts_updated_at = :now',
                        ExpressionAttributeNames: { '#status': 'status' },
                        ExpressionAttributeValues: {
                            ':expired': 'EXPIRED',
                            ':gsi_pk': 'QR#EXPIRED',
                            ':now': now.toISOString()
                        }
                    }));
                } catch (e) {
                    console.error('Failed to update expired status in submit', e);
                }
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'QR Code has expired' }) };
            }
        }

        // Check Lock
        if (isLocked(getRes.Item)) {
            return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'Too many attempts. Please try again later.' }) };
        }

        if (getRes.Item.pin !== pin_code) {
            const { UpdateExpression, ExpressionAttributeValues, ExpressionAttributeNames } = getRateLimitUpdate(getRes.Item);
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
                UpdateExpression,
                ExpressionAttributeValues,
                ExpressionAttributeNames
            }));
            return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid PIN' }) };
        }

        // Hash password if provided
        let password_hash: string | undefined;
        if (password) {
            try {
                console.log("Hashing password...");
                const bcrypt = await import('bcryptjs');
                const salt = await bcrypt.genSalt(10);
                password_hash = await bcrypt.hash(password, salt);
                console.log("Password hashed successfully");
            } catch (bcryptError) {
                console.error("Bcrypt error:", bcryptError);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: "Error processing password" })
                };
            }
        }

        const now = new Date().toISOString();
        // 2. Transact Write: Update Status + Create Order
        await ddb.send(new TransactWriteCommand({
            TransactItems: [
                {
                    Update: {
                        TableName: TABLE_NAME,
                        Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
                        UpdateExpression: 'SET #status = :used, GSI1_PK = :gsi_pk, ts_updated_at = :now, ts_submitted_at = :now' + (password_hash ? ', password_hash = :ph' : '') + ' REMOVE #fa, #lu',
                        ConditionExpression: '#status = :active', // Double check race condition
                        ExpressionAttributeNames: {
                            '#status': 'status',
                            '#fa': 'failed_attempts',
                            '#lu': 'locked_until'
                        },
                        ExpressionAttributeValues: {
                            ':used': 'USED',
                            ':active': 'ACTIVE',
                            ':gsi_pk': 'QR#USED',
                            ':now': now,
                            ...(password_hash ? { ':ph': password_hash } : {})
                        }
                    }
                },
                {
                    Put: {
                        TableName: TABLE_NAME,
                        Item: {
                            PK: `QR#${qr_id}`,
                            SK: 'ORDER',
                            ...shipping_info,
                            ts_submitted_at: now,
                            ts_updated_at: now
                        }
                    }
                }
            ]
        }));

        const resultResponse = {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'Address submitted successfully',
                order_id: `ORDER#${qr_id}`
            })
        };

        // 3. Auto-Subscribe to notification if email is provided
        if (shipping_info.email) {
            try {
                const email = shipping_info.email;
                const lang = 'ja'; // Default to JA for now as we don't track locale in submit yet. Or could be passed.

                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `QR#${qr_id}`, SK: 'CHAT' },
                    UpdateExpression: 'ADD notification_emails :new_email SET email_preferences = if_not_exists(email_preferences, :empty_map)',
                    ExpressionAttributeValues: {
                        ':new_email': new Set([email]),
                        ':empty_map': {}
                    }
                }));

                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `QR#${qr_id}`, SK: 'CHAT' },
                    UpdateExpression: 'SET email_preferences.#em = :lang',
                    ExpressionAttributeNames: {
                        '#em': email
                    },
                    ExpressionAttributeValues: {
                        ':lang': lang
                    }
                }));

                // 4. Send Confirmation Email
                // if (SENDER_EMAIL) { // Removed check here, email-client checks
                const subject = (lang === 'ja') ? '【名刺がわりに】住所登録完了のお知らせ' : '【Meishigawarini】Address Registration Completed';
                const bodyText = (lang === 'ja') ? `
住所の登録が完了しました。
商品の発送まで今しばらくお待ちください。

確認はこちら:
${process.env.NEXT_PUBLIC_APP_URL}/receive/${qr_id}
PIN: ${pin_code}
`.trim() : `
Address registration completed.
Please wait for the item to be shipped.

Check here:
${process.env.NEXT_PUBLIC_APP_URL}/receive/${qr_id}
PIN: ${pin_code}
`.trim();

                await sendEmail({
                    to: [email],
                    subject: subject,
                    text: bodyText
                });
                // }

            } catch (e) {
                console.error('Failed to auto-subscribe/send email:', e);
                // Non-critical, do not fail the request
            }
        }

        return resultResponse;

    } catch (error: any) {
        console.error("Critical/Unexpected Error", error);
        if (error.name === 'TransactionCanceledException') {
            return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ message: 'Transaction failed (possibly already used)' }) };
        }
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Internal Server Error', error: error.toString() })
        };
    }
};
