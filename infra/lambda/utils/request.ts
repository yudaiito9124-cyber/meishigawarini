import { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * Perform a case-insensitive header lookup.
 */
export const getHeader = (headers: Record<string, string | undefined> | null | undefined, key: string): string | undefined => {
    if (!headers) return undefined;
    const lowerKey = key.toLowerCase();
    const actualKey = Object.keys(headers).find(k => k.toLowerCase() === lowerKey);
    return actualKey ? headers[actualKey] : undefined;
};

/**
 * リクエストから QR ID を安全に取得します。
 * リクエストから QR ID を安全に取得します。
 * 優先順位: 1. Authorizer, 2. PathParameters, 3. Headers, 4. Body
 */
export const getQrId = (event: APIGatewayProxyEvent, body: any = {}): string | undefined => {
    return (
        event.requestContext?.authorizer?.qr_id ||
        event.pathParameters?.qr_id ||
        getHeader(event.headers, 'x-qr-id') ||
        body?.qr_id
    );
};

/**
 * リクエストから PIN を安全に取得します。
 * 優先順位: 1. Authorizer, 2. Headers, 3. Body
 */
export const getPIN = (event: APIGatewayProxyEvent, body: any = {}): string | undefined => {
    return (
        event.requestContext?.authorizer?.pin ||
        getHeader(event.headers, 'x-qr-pin') ||
        body?.pin
    );
};

/**
 * リクエストから ShopID を安全に取得します。
 */
export const getShopId = (event: APIGatewayProxyEvent, body: any = {}): string | undefined => {
    return (
        event.requestContext?.authorizer?.shop_id ||
        getHeader(event.headers, 'x-shop-id') ||
        event.pathParameters?.shop_id ||
        body?.shop_id ||
        event.queryStringParameters?.shop_id
    );
};

/**
 * リクエストから ProductID を安全に取得します。
 */
export const getProductId = (event: APIGatewayProxyEvent, body: any = {}): string | undefined => {
    return (
        getHeader(event.headers, 'x-product-id') ||
        body?.product_id ||
        event.queryStringParameters?.product_id
    );
};

/**
 * リクエストから UserId (Cognito) を安全に取得します。
 */
export const getUserId = (event: APIGatewayProxyEvent): string | undefined => {
    return (
        event.requestContext?.authorizer?.user_id ||
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
