import { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * リクエストから UUID を安全に取得します。
 * 優先順位: 1. Authorizer, 2. PathParameters, 3. Headers, 4. Body
 */
export const getUUID = (event: APIGatewayProxyEvent, body: any = {}): string | undefined => {
    return (
        event.requestContext?.authorizer?.uuid ||
        event.pathParameters?.uuid ||
        event.headers['X-QR-UUID'] ||
        event.headers['x-qr-uuid'] ||
        body?.qr_id ||
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
        body?.pin
    );
};

/**
 * リクエストから ShopID を安全に取得します。
 */
export const getShopId = (event: APIGatewayProxyEvent, body: any = {}): string | undefined => {
    return body?.shopId || body?.shop_id || event.queryStringParameters?.shopId;
};

/**
 * リクエストから UserId (Cognito) を安全に取得します。
 */
export const getUserId = (event: APIGatewayProxyEvent): string | undefined => {
    return event.requestContext?.authorizer?.principalId;
};

/**
 * リクエストパスの末尾（/list, /create 等）からアクション名を判定します。
 */
export const getAction = (event: APIGatewayProxyEvent, body: any = {}): string | undefined => {
    // 1. ボディに action が明示されている場合はそれを優先
    if (body.action) return body.action;

    // 2. リソースパスの末尾から判定
    const resPath = event.resource || '';
    if (resPath.endsWith('/get')) return 'get';
    if (resPath.endsWith('/list')) return 'list';
    if (resPath.endsWith('/create')) return 'create';
    if (resPath.endsWith('/update')) return 'update';
    if (resPath.endsWith('/delete')) return 'delete';
    if (resPath.endsWith('/send')) return 'send';
    if (resPath.endsWith('/sendgift')) return 'sendgift';
    if (resPath.endsWith('/cancel')) return 'cancel';
    if (resPath.endsWith('/complete')) return 'complete';
    if (resPath.endsWith('/activate')) return 'activate';
    if (resPath.endsWith('/link')) return 'link';
    if (resPath.endsWith('/uploadurl')) return 'uploadurl';
    if (resPath.endsWith('/load')) return 'load';
    if (resPath.endsWith('/save')) return 'save';
    if (resPath.endsWith('/execute')) return 'execute';
    if (resPath.endsWith('/delete-images')) return 'delete_images';

    return undefined;
};
