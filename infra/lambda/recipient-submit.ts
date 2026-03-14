
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, TransactWriteCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { sendEmail } from './utils/email-client';
import { isLocked, getRateLimitUpdate } from './utils/rate-limit';

const client = new DynamoDBClient({});
const cognito = new CognitoIdentityProviderClient({});
const ddb = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true,
        convertEmptyValues: true
    }
});
const TABLE_NAME = process.env.TABLE_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    const { body, ...eventWithoutBody } = event;
    console.log("Recipient Submit Handler Invoked", JSON.stringify(eventWithoutBody));
    try {
        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };
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

        const { name, address, zipCode, preferredDate, preferredTime } = shipping_info;
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

                // 4. Send Confirmation Email to Recipient
                const subject = (lang === 'ja') ? '縲仙錐蛻ｺ縺後ｏ繧翫↓縲台ｽ乗園逋ｻ骭ｲ螳御ｺ・・縺顔衍繧峨○' : '縲信eishigawarini縲羨ddress Registration Completed';
                const bodyText = (lang === 'ja') ? `
菴乗園縺ｮ逋ｻ骭ｲ縺悟ｮ御ｺ・＠縺ｾ縺励◆縲・
蝠・刀縺ｮ逋ｺ騾√∪縺ｧ莉翫＠縺ｰ繧峨￥縺雁ｾ・■縺上□縺輔＞縲・

闕ｷ迚ｩ縺ｮ迥ｶ諷九・縺薙■繧・
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

            } catch (e) {
                console.error('Failed to auto-subscribe/send email to recipient:', e);
                // Non-critical, do not fail the request
            }
        }

        // 5. Send Notification Email to Shop Owner
        try {
            const shopId = getRes.Item.shop_id;
            const productId = getRes.Item.product_id;

            if (shopId) {
                // Fetch Shop and Product Metadata in parallel
                const [shopRes, productRes] = await Promise.all([
                    ddb.send(new GetCommand({
                        TableName: TABLE_NAME,
                        Key: { PK: `SHOP#${shopId}`, SK: 'METADATA' }
                    })),
                    productId ? ddb.send(new GetCommand({
                        TableName: TABLE_NAME,
                        Key: { PK: `SHOP#${shopId}`, SK: `PRODUCT#${productId}` }
                    })) : Promise.resolve({ Item: undefined })
                ]);

                let shopEmail = shopRes.Item?.email;
                const shopName = shopRes.Item?.name || '荳肴・縺ｪ繧ｷ繝ｧ繝・・';
                const productName = productRes.Item?.name || '荳肴・縺ｪ蝠・刀';

                // Fallback: If email is missing, try to get from Cognito
                if (!shopEmail && shopRes.Item?.owner_id) {
                    try {
                        console.log(`Shop email missing for ${shopId}, fetching from Cognito user ${shopRes.Item.owner_id}`);
                        const userPoolId = process.env.USER_POOL_ID;
                        if (userPoolId) {
                            const userRes = await cognito.send(new AdminGetUserCommand({
                                UserPoolId: userPoolId,
                                Username: shopRes.Item.owner_id
                            }));
                            const emailAttr = userRes.UserAttributes?.find(attr => attr.Name === 'email');
                            if (emailAttr && emailAttr.Value) {
                                shopEmail = emailAttr.Value;
                                console.log(`Fetched email from Cognito: ${shopEmail}`);
                            }
                        } else {
                            console.warn("USER_POOL_ID not set, cannot fetch from Cognito");
                        }
                    } catch (cognitoError) {
                        console.error("Failed to fetch user from Cognito:", cognitoError);
                    }
                }

                if (shopEmail) {
                    const subject = '縲仙錐蛻ｺ縺後ｏ繧翫↓縲代♀螻翫￠蜈井ｽ乗園縺檎匳骭ｲ縺輔ｌ縺ｾ縺励◆';
                    const jstNow = new Date(now).toLocaleString();

                    const bodyText = `
繧ｷ繝ｧ繝・・繧ｪ繝ｼ繝翫・讒・

縺ゅ↑縺溘・繧ｷ繝ｧ繝・・縲・{shopName}縲阪・蝠・刀縺ｫ縺雁ｱ翫￠蜈井ｽ乗園縺檎匳骭ｲ縺輔ｌ縺ｾ縺励◆縲・

蝠・刀蜷・ ${productName}
豕ｨ譁⑩D: ${qr_id}
逋ｻ骭ｲ譌･譎・ ${jstNow}

邂｡逅・判髱｢縺九ｉ豕ｨ譁・ｩｳ邏ｰ繧堤｢ｺ隱阪＠縲∫匱騾∵ｺ門ｙ繧帝ｲ繧√※縺上□縺輔＞縲・

邂｡逅・判髱｢:
${process.env.NEXT_PUBLIC_APP_URL}/shop/${shopId}
`.trim();

                    await sendEmail({
                        to: [shopEmail],
                        subject: subject,
                        text: bodyText
                    });
                    console.log(`Notification email sent to shop owner: ${shopEmail}`);
                } else {
                    console.warn(`Shop owner email not found for shop: ${shopId}`);
                }
            } else {
                console.warn(`No shop_id found for QR: ${qr_id}`);
            }
        } catch (e) {
            console.error('Failed to send notification email to shop owner:', e);
            // Non-critical
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
