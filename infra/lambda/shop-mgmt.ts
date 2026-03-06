import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const s3 = new S3Client({});

const TABLE_NAME = process.env.TABLE_NAME || '';
const BUCKET_NAME = process.env.BUCKET_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,GET,PATCH,DELETE'
};

const DEFAULT_VALID_DAYS = parseInt(process.env.DEFAULT_VALID_DAYS || '1');

async function checkShopOwner(shopuuid: string | undefined, userid: string) {
    if (!shopuuid || !userid) return false;

    const shopRes = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `SHOP#${shopuuid}`, SK: 'METADATA' }
    }));
    if (!shopRes.Item || shopRes.Item.owner_id !== userid) return false;

    return shopRes.Item;
}

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        const path = event.path;
        const method = event.httpMethod;
        const shopId = event.pathParameters?.shopId;
        // Get User ID from Cognito
        const claims = event.requestContext?.authorizer?.claims;
        const userId = claims?.sub; // 'sub' is the unique user ID in Cognito


        // 認証済みか確認
        if (!userId) return { statusCode: 401, headers: corsHeaders, body: 'Unauthorized' };
        //////////// ここから下は 認証済みの場合のみアクセス可能


        // 1. Create Shop (POST /shop)
        // Requires Auth
        if (method === 'POST' && path.endsWith('/shop') && !shopId) {
            if (!userId) return { statusCode: 401, headers: corsHeaders, body: 'Unauthorized' };

            const body = JSON.parse(event.body || '{}');
            const { name } = body;
            if (!name) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing name' }) };

            const email = claims.email; // Get email from Cognito claims

            const newShopId = crypto.randomUUID();
            const now = new Date().toISOString();
            await ddb.send(new PutCommand({
                TableName: TABLE_NAME,
                Item: {
                    PK: `SHOP#${newShopId}`,
                    SK: 'METADATA',
                    name,
                    email, // Store email
                    owner_id: userId, // Link to User
                    GSI2_PK: `USER#${userId}`, // GSI2 for Owner Listing
                    GSI2_SK: now,
                    ts_created_at: now
                }
            }));

            return { statusCode: 201, headers: corsHeaders, body: JSON.stringify({ shop_id: newShopId, message: 'Shop created' }) };
        }

        // 2. List My Shops (GET /shop)
        if (method === 'GET' && path.endsWith('/shop') && !shopId) {
            const res = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: 'GSI2',
                KeyConditionExpression: 'GSI2_PK = :uid',
                ExpressionAttributeValues: {
                    ':uid': `USER#${userId}`
                }
            }));

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ shops: res.Items }) };
        }



        let shopMetadata: any = null;
        shopMetadata = await checkShopOwner(shopId, userId);
        if (shopMetadata === false) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ message: 'Unauthorized' }) };
        }
        //////////// ここから下は 認証済みかつ指定されたショップ(shopId)のオーナーのみアクセス可能




        // 2. Get Shop Details (GET /shop/{shopId})
        if (method === 'GET' && (path.endsWith(`/shop/${shopId}`) || path.endsWith(`/shop/${shopId}/`))) {
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(shopMetadata) };
        }

        // 3. Create Product (POST /shop/{shopId}/products)
        if (method === 'POST' && path.endsWith('/products')) {

            const body = JSON.parse(event.body || '{}');
            const { name, description, image_url, price, valid_days } = body;
            if (!name) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing product name' }) };

            const productId = crypto.randomUUID();
            // Default valid_days to 1 if not provided
            const validityPeriod = valid_days ? parseInt(valid_days) : DEFAULT_VALID_DAYS;
            const now = new Date().toISOString();

            await ddb.send(new PutCommand({
                TableName: TABLE_NAME,
                Item: {
                    PK: `SHOP#${shopId}`,
                    SK: `PRODUCT#${productId}`,
                    product_id: productId, // Added product_id as per request
                    name,
                    description,
                    image_url,
                    price,
                    valid_days: validityPeriod,
                    status: 'ACTIVE', // Default status
                    GSI1_PK: 'PRODUCT#ACTIVE', // For listing active products
                    GSI1_SK: now, // Optional: Sort by creation date
                    GSI2_PK: `PRODUCT#${productId}`, // Added for UUID lookup
                    GSI2_SK: `SHOP#${shopId}`, // Optional: 
                    ts_created_at: now
                }
            }));

            return { statusCode: 201, headers: corsHeaders, body: JSON.stringify({ product_id: productId, message: 'Product created' }) };
        }

        // 3. My Shop list for Import Product (GET /shop/{shopId}/products/import)
        if (method === 'GET' && path.endsWith('/products/import')) {
            const res = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: 'GSI2',
                KeyConditionExpression: 'GSI2_PK = :uid',
                ExpressionAttributeValues: {
                    ':uid': `USER#${userId}`
                }
            }));
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ shops: res.Items }) };
        }

        // 3. Import Product From My Shop (POST /shop/{shopId}/products/import)
        if (method === 'POST' && path.endsWith('/products/import')) {

            const body = JSON.parse(event.body || '{}');
            let { importShopId } = body;

            if (!importShopId) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing importShopId' }) };

            let importShopMetadata = await checkShopOwner(importShopId, userId)
            if (importShopMetadata === false) {
                return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ message: 'Unauthorized for import source shop' }) };
            }

            const prodsRes = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
                ExpressionAttributeValues: {
                    ':pk': `SHOP#${importShopId}`,
                    ':sk': 'PRODUCT#'
                }
            }));

            const productsToImport = prodsRes.Items || [];
            if (productsToImport.length === 0) {
                return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: "The source shop has no products", imported: 0 }) };
            }

            const region = process.env.AWS_REGION || 'ap-northeast-1';
            let importedCount = 0;

            for (const prod of productsToImport) {
                let newImageUrl = prod.image_url;

                if (prod.image_url && prod.image_url.includes(BUCKET_NAME)) {
                    try {
                        const urlObj = new URL(prod.image_url);
                        const sourceKey = decodeURIComponent(urlObj.pathname.substring(1));

                        const ext = sourceKey.split('.').pop() || 'jpg';
                        const newFilename = `${crypto.randomUUID()}.${ext}`;
                        const newKey = `shop/${shopId}/products/${newFilename}`;

                        await s3.send(new CopyObjectCommand({
                            Bucket: BUCKET_NAME,
                            CopySource: encodeURI(`${BUCKET_NAME}/${sourceKey}`),
                            Key: newKey
                        }));

                        newImageUrl = `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${newKey}`;
                    } catch (e) {
                        console.error('Failed to copy image for product', prod.product_id, e);
                    }
                }

                const copyItem = { ...prod };
                copyItem.PK = `SHOP#${shopId}`;
                copyItem.image_url = newImageUrl;

                if (copyItem.GSI2_SK && copyItem.GSI2_SK.startsWith('SHOP#')) {
                    copyItem.GSI2_SK = `SHOP#${shopId}`;
                }

                await ddb.send(new PutCommand({
                    TableName: TABLE_NAME,
                    Item: copyItem
                }));

                importedCount++;
            }

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: "Products imported successfully", imported: importedCount }) };
        }

        //    Get Upload URL for 3. Create product (POST /shop/{shopId}/products/upload-url)
        if (method === 'POST' && path.endsWith('/upload-url')) {
            const body = JSON.parse(event.body || '{}');
            const { filename, contentType } = body;
            if (!filename || !contentType) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing filename or contentType' }) };

            const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
            if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid content type. Only images are allowed.' }) };
            }

            const ext = filename.split('.').pop()?.toLowerCase();
            const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
            if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid file extension. Only images are allowed.' }) };
            }

            const key = `shop/${shopId}/products/${filename}`;
            const command = new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: key,
                ContentType: contentType
            });

            const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
            const region = process.env.AWS_REGION || 'ap-northeast-1';
            const publicUrl = `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${key}`;

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ uploadUrl, publicUrl }) };
        }

        // 4. List Products (GET /shop/{shopId}/products)
        if (method === 'GET' && path.endsWith('/products')) {

            const res = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
                ExpressionAttributeValues: {
                    ':pk': `SHOP#${shopId}`,
                    ':sk': 'PRODUCT#'
                }
            }));
            const items = (res.Items || []).map(item => ({
                ...item,
                product_id: item.SK.replace('PRODUCT#', '')
            }));
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ items }) };
        }

        // 5. Link QR (POST /shop/{shopId}/link)
        if (method === 'POST' && path.endsWith('/link')) {

            const body = JSON.parse(event.body || '{}');
            let { qr_id, product_id, memo_for_users, memo_for_shop, activate_now } = body;
            if (!qr_id) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing qr_id' }) };

            // Fetch QR to determine status and existing product_id
            const qrCheck = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${qr_id}`, SK: 'METADATA' }
            }));
            if (!qrCheck.Item) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'QR not found' }) };

            const qrItem = qrCheck.Item;
            if (qrItem.status === 'LINKED') {
                if (qrItem.shop_id && qrItem.shop_id !== shopId) return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'QR does not belong to this shop' }) };
                if (product_id && product_id !== qrItem.product_id) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Product ID cannot be changed for linked QR' }) };
                product_id = qrItem.product_id;
            } else if (qrItem.status === 'UNASSIGNED') {
                if (!product_id) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing product_id for unassigned QR' }) };
            } else {
                return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ message: 'QR cannot be linked/activated (not UNASSIGNED or LINKED)' }) };
            }

            // Verify Product belongs to Shop
            const prodCheck = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `SHOP#${shopId}`, SK: `PRODUCT#${product_id}` }
            }));
            if (!prodCheck.Item) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Product not found in this shop' }) };

            const product = prodCheck.Item;
            const validDays = product.valid_days || DEFAULT_VALID_DAYS;

            // Link QR (and optionally activate)
            const status = activate_now ? 'ACTIVE' : 'LINKED';
            const gsiPk = activate_now ? 'QR#ACTIVE' : 'QR#LINKED';
            const activatedAt = activate_now ? new Date().toISOString() : undefined;

            // Calculate expiration if activating now
            let expiresAt = undefined;
            if (activate_now) {
                const activationDate = new Date();
                const expirationDate = new Date(activationDate);
                expirationDate.setDate(expirationDate.getDate() + validDays);
                expiresAt = expirationDate.toISOString();
            }

            let updateExpr = 'SET #status = :status, shop_id = :sid, product_id = :pid, GSI1_PK = :gsi_pk, GSI2_PK = :gsi2_pk, GSI2_SK = :now, ts_linked_at = :now, ts_updated_at = :now';
            const attrValues: any = {
                ':status': status,
                ':linked': 'LINKED',
                ':sid': shopId,
                ':pid': product_id,
                ':gsi_pk': gsiPk,
                ':gsi2_pk': `SHOP#${shopId}`,
                ':now': new Date().toISOString(),
                ':unassigned': 'UNASSIGNED'
            };

            if (memo_for_users !== undefined) {
                updateExpr += ', memo_for_users = :memo_for_users';
                attrValues[':memo_for_users'] = memo_for_users;
            }
            if (memo_for_shop !== undefined) {
                updateExpr += ', memo_for_shop = :memo_for_shop';
                attrValues[':memo_for_shop'] = memo_for_shop;
            }

            if (activate_now) {
                updateExpr += ', ts_activated_at = :act_at';
                attrValues[':act_at'] = activatedAt;
                if (expiresAt) {
                    updateExpr += ', ts_expired_at = :exp_at';
                    attrValues[':exp_at'] = expiresAt;
                }
            }

            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
                UpdateExpression: updateExpr,
                ConditionExpression: '(#status = :linked AND shop_id = :sid) OR #status = :unassigned',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: attrValues
            }));

            // If activating, we might want to also set GSI1 separately if our single-table design requires it, 
            // but here we are just updating the main item. GSI1 maps to status usually.

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: `QR Linked successfully${activate_now ? ' and Activated' : ''}` }) };
        }

        // 6. Activate QR (POST /shop/{shopId}/activate)
        if (method === 'POST' && path.endsWith('/activate')) {

            const body = JSON.parse(event.body || '{}');
            const { qr_id } = body;
            if (!qr_id) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing qr_id' }) };

            // Fetch QR to get product_id
            const qrRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${qr_id}`, SK: 'METADATA' }
            }));

            if (!qrRes.Item) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'QR not found' }) };

            if (qrRes.Item.status !== 'LINKED') {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'QR is not in LINKED state' }) };
            }
            if (qrRes.Item.shop_id !== shopId) {
                return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ message: 'QR does not belong to this shop' }) };
            }

            const productId = qrRes.Item.product_id;

            // Fetch Product for validity days
            const prodRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `SHOP#${shopId}`, SK: `PRODUCT#${productId}` }
            }));

            const validDays = (prodRes.Item && prodRes.Item.valid_days) ? prodRes.Item.valid_days : DEFAULT_VALID_DAYS;
            const now = new Date();
            const expiresAt = new Date(now);
            expiresAt.setDate(expiresAt.getDate() + validDays);

            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${qr_id}`, SK: 'METADATA' },
                UpdateExpression: 'SET #status = :active, ts_activated_at = :now, ts_expired_at = :exp, GSI1_PK = :gsi_pk, ts_updated_at = :now',
                ConditionExpression: '#status = :linked AND shop_id = :sid',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':active': 'ACTIVE',
                    ':linked': 'LINKED',
                    ':sid': shopId,
                    ':now': now.toISOString(),
                    ':exp': expiresAt.toISOString(),
                    ':gsi_pk': 'QR#ACTIVE'
                }
            }));

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'QR Activated successfully' }) };
        }

        // 7. Update Product Status
        if (method === 'PATCH' && path.includes('/products/')) {

            const pid = event.pathParameters?.productId;
            if (!pid) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing product ID' }) };

            const body = JSON.parse(event.body || '{}');
            const { status } = body;
            if (!['ACTIVE', 'STOPPED'].includes(status)) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid status. Must be ACTIVE or STOPPED' }) };
            }

            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `SHOP#${shopId}`, SK: `PRODUCT#${pid}` },
                UpdateExpression: 'SET #status = :s, GSI1_PK = :gsi_pk',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: { ':s': status, ':gsi_pk': `PRODUCT#${status}` }
            }));

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Product status updated' }) };
        }

        // 8. Delete Product
        if (method === 'DELETE' && path.includes('/products/')) {

            const pid = event.pathParameters?.productId;
            if (!pid) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing product ID' }) };

            const prodRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `SHOP#${shopId}`, SK: `PRODUCT#${pid}` }
            }));

            if (!prodRes.Item) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Product not found' }) };

            if (prodRes.Item.status !== 'STOPPED') {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Cannot delete product unless it is STOPPED (この商品が受注停止でないと削除できません)' }) };
            }

            const [usedRes, activeRes] = await Promise.all([
                ddb.send(new QueryCommand({
                    TableName: TABLE_NAME,
                    IndexName: 'GSI1',
                    KeyConditionExpression: 'GSI1_PK = :pk',
                    ExpressionAttributeValues: { ':pk': 'QR#USED' }
                })),
                ddb.send(new QueryCommand({
                    TableName: TABLE_NAME,
                    IndexName: 'GSI1',
                    KeyConditionExpression: 'GSI1_PK = :pk',
                    ExpressionAttributeValues: { ':pk': 'QR#ACTIVE' }
                }))
            ]);
            const activeOrUsedQRs = [...(usedRes.Items || []), ...(activeRes.Items || [])];
            const relatedQRs = activeOrUsedQRs.filter(item => item.product_id === pid && item.shop_id === shopId);
            if (relatedQRs.length > 0) {
                const qrIds = relatedQRs.map(qr => qr.PK.replace('QR#', '')).join(', ');
                return {
                    statusCode: 409, headers: corsHeaders, body: JSON.stringify({
                        message: `Cannot delete product with active QRs or unshipped orders (この商品に紐づけられた有効なQRコードまたは未発送の注文があります) 対象QR: ${qrIds}`,
                        relatedQRs: relatedQRs.map(qr => qr.PK.replace('QR#', ''))
                    })
                };
            }

            await ddb.send(new DeleteCommand({
                TableName: TABLE_NAME,
                Key: { PK: `SHOP#${shopId}`, SK: `PRODUCT#${pid}` }
            }));

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Product deleted' }) };
        }

        // 9. List Shop QRs ((GET /shop/{shopId}/qrcodes)
        if (method === 'GET' && path.endsWith('/qrcodes')) {
            const res = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: 'GSI2',
                KeyConditionExpression: 'GSI2_PK = :sid',
                ExpressionAttributeValues: {
                    ':sid': `SHOP#${shopId}`
                }
            }));

            // Map to simpler structure AND check for expiration
            const now = new Date();
            const updatePromises: Promise<any>[] = [];

            const items = (res.Items || []).map(item => {
                let status = item.status;
                let ts_expired_at = item.ts_expired_at;

                // Check if expired but still marked as ACTIVE
                if (status === 'ACTIVE' && ts_expired_at) {
                    const expiresAt = new Date(ts_expired_at);
                    if (now > expiresAt) {
                        status = 'EXPIRED';
                        // Trigger async update
                        updatePromises.push(
                            ddb.send(new UpdateCommand({
                                TableName: TABLE_NAME,
                                Key: { PK: item.PK, SK: 'METADATA' },
                                UpdateExpression: 'SET #status = :expired, GSI1_PK = :gsi_pk, ts_updated_at = :now',
                                ExpressionAttributeNames: { '#status': 'status' },
                                ExpressionAttributeValues: {
                                    ':expired': 'EXPIRED',
                                    ':gsi_pk': 'QR#EXPIRED',
                                    ':now': now.toISOString()
                                }
                            })).catch(e => console.error(`Failed to update expired status for ${item.PK}`, e))
                        );
                    }
                }

                return {
                    id: item.PK.replace('QR#', ''),
                    status: status,
                    product_id: item.product_id,
                    ts_created_at: item.ts_created_at,
                    ts_activated_at: item.ts_activated_at,
                    ts_expired_at: ts_expired_at
                };
            });

            // Wait for all updates to complete (or fail) before returning?
            // Usually for list API, latency matters. But since we want to be correct, maybe waiting isn't too bad if there are few.
            // Let's await to be safe and ensure data consistency next refresh.
            if (updatePromises.length > 0) {
                await Promise.all(updatePromises);
            }

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ items }) };
        }

        return { statusCode: 404, headers: corsHeaders, body: 'Not Found' };

    } catch (error: any) {
        console.error(error);
        if (error.name === 'ConditionalCheckFailedException') {
            return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ message: 'Operation failed. QR might not be in correct state or belongs to another shop. (このQRコードはすでに別のショップまたは商品に紐づけられています、上書きはできません)' }) };
        }
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: String(error) }) };
    }
};
