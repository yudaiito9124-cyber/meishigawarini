import { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * リクエストから QR ID を安全に取得します。
 * 優先順位: 1. Authorizer, 2. PathParameters, 3. Headers, 4. Body
 */
export const getQrId = (event: APIGatewayProxyEvent, body: any = {}): string | undefined => {
    return (
        event.requestContext?.authorizer?.qr_id ||
        event.requestContext?.authorizer?.qrId ||
        event.requestContext?.authorizer?.uuid ||
        event.pathParameters?.qr_id ||
        event.pathParameters?.qrId ||
        event.pathParameters?.uuid ||
        event.headers['X-QR-ID'] ||
        event.headers['x-qr-id'] ||
        event.headers['X-QR-UUID'] ||
        event.headers['x-qr-uuid'] ||
        body?.qr_id ||
        body?.qrId ||
        body?.uuid
    );
};

/**
 * リクエストから PIN を安全に取得します。
 * 優先順位: 1. Authorizer, 2. Headers, 3. Body
 */
export const getPIN = (event: APIGatewayProxyEvent, body: any = {}): string | undefined => {
    return (
        event.requestContext?.authorizer?.pin ||
        event.headers['X-QR-PIN'] ||
        event.headers['x-qr-pin'] ||
        body?.pin_code ||
        body?.pinCode ||
        body?.pin
    );
};

/**
 * リクエストから ShopID を安全に取得します。
 */
export const getShopId = (event: APIGatewayProxyEvent, body: any = {}): string | undefined => {
    return (
        event.headers['X-Shop-Id'] ||
        event.headers['x-shop-id'] ||
        body?.shop_id ||
        body?.shopId ||
        event.queryStringParameters?.shopId ||
        event.queryStringParameters?.shop_id
    );
};

/**
 * リクエストから ProductID を安全に取得します。
 */
export const getProductId = (event: APIGatewayProxyEvent, body: any = {}): string | undefined => {
    return (
        event.headers['X-Product-Id'] ||
        event.headers['x-product-id'] ||
        body?.product_id ||
        body?.productId ||
        event.queryStringParameters?.productId ||
        event.queryStringParameters?.product_id
    );
};

/**
 * リクエストから UserId (Cognito) を安全に取得します。
 */
export const getUserId = (event: APIGatewayProxyEvent): string | undefined => {
    return (
        event.requestContext?.authorizer?.principalId ||
        event.requestContext?.authorizer?.claims?.sub
    );
};

/**
 * リクエストパスの末尾（/list, /create 等）からアクション名を判定します。
 */
export const getAction = (event: APIGatewayProxyEvent, body: any = {}): string | undefined => {
    // 1. ボディに action が明示されている場合はそれを優先
    if (body.action) return body.action;

    // 2. パスの最後のスラッシュ以降を Action として取得
    const path = event.path || '';
    const parts = path.split('/');
    return parts[parts.length - 1] || undefined;
};
