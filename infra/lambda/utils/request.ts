/**
 * @file request.ts
 * @role API リクエスト解析ユーティリティ
 * @responsibility
 *  - API Gateway 実行イベント（APIGatewayProxyEvent）から各種パラメータを抽出します。
 *  - パラメータ抽出における優先順位（Authorizer > Path > Header > Body）を定義し、一貫したアクセスを提供します。
 *  - 大文字小文字を区別しないヘッダー検索等のフールプルーフな補助機能を提供します。
 * @context
 *  - Lambda 関数の冒頭でリクエスト内容をパースし、ビジネスロジックに必要な ID 等を取得するために使用されます。
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * ヘッダー名の大文字小文字を区別せずに値を検索します。
 * 
 * @param headers - API イベントのヘッダーオブジェクト。
 * @param key - 検索したいヘッダー名（例: 'x-shop-id'）。
 * @returns ヒットしたヘッダーの値、見つからない場合は undefined。
 */
export const getHeader = (headers: Record<string, string | undefined> | null | undefined, key: string): string | undefined => {
    if (!headers) return undefined;
    const lowerKey = key.toLowerCase();
    const actualKey = Object.keys(headers).find(k => k.toLowerCase() === lowerKey);
    return actualKey ? headers[actualKey] : undefined;
};

/**
 * リクエストから QR ID を安全に抽出します。
 * 
 * @description
 * 以下の優先順位で値を探索します（信頼度が高い順）：
 * 1. カスタムオーソライザー (context.qr_id)
 * 2. URL パスパラメータ ({qr_id})
 * 3. リクエストヘッダー (x-qr-id)
 * 4. リクエストボディ (qr_id)
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
 * リクエストからギフト用 PIN コードを抽出します。
 * 
 * @description
 * 探索優先順位:
 * 1. カスタムオーソライザー (context.pin)
 * 2. リクエストヘッダー (x-qr-pin)
 * 3. リクエストボディ (pin)
 */
export const getPIN = (event: APIGatewayProxyEvent, body: any = {}): string | undefined => {
    return (
        event.requestContext?.authorizer?.pin ||
        getHeader(event.headers, 'x-qr-pin') ||
        body?.pin
    );
};

/**
 * リクエストからショップ ID を抽出します。
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
 * リクエストから商品 ID を抽出します。
 */
export const getProductId = (event: APIGatewayProxyEvent, body: any = {}): string | undefined => {
    return (
        getHeader(event.headers, 'x-product-id') ||
        body?.product_id ||
        event.queryStringParameters?.product_id
    );
};

/**
 * リクエストから認証済みユーザー ID (Cognito sub) を安全に抽出します。
 * 
 * @description
 * ID トークンまたはカスタムオーソライザーからの情報を使用します。
 * receiver (ギフト受取人) や guest ID は、正式なユーザー履歴用 ID としては返却しません。
 */
export const getUserId = (event: APIGatewayProxyEvent): string | undefined => {
    // 1. カスタムオーソライザー経由での取得 (context.user_id)
    if (event.requestContext?.authorizer?.user_id) return event.requestContext.authorizer.user_id;

    // 2. Cognito 直接認証時の claims (claims.sub)
    if (event.requestContext?.authorizer?.claims?.sub) return event.requestContext.authorizer.claims.sub;

    // 3. principalId の利用（ゲスト/受取人は除外）
    const pid = event.requestContext?.authorizer?.principalId;
    if (pid && !pid.startsWith('receiver-') && !pid.startsWith('guest-')) return pid;

    return undefined;
};

/**
 * URL パス（末尾）またはリクエストボディからアクション名を取得します。
 * 
 * @description
 * アクションベースのルーティングを実現するための中心機能です。
 * - ボディの `action` フィールドがあれば最優先。
 * - なければ URL `/auth/login` の `login` のように、末尾のセグメントをアクションとみなします。
 */
export const getAction = (event: APIGatewayProxyEvent, body: any = {}): string | undefined => {
    // 1. ボディに action が明示されている場合はそれを優先
    if (body.action) return body.action;

    // 2. パスの最後のスラッシュ以降を Action として取得
    const path = event.path || '';
    const parts = path.split('/');
    return parts[parts.length - 1] || undefined;
};
