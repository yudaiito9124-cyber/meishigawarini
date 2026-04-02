import { APIGatewayProxyResult } from 'aws-lambda';

export const getCorsHeaders = (methods: string = 'GET,POST,OPTIONS') => ({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-QR-ID,X-QR-UUID,X-QR-PIN',
    'Access-Control-Allow-Methods': methods
});

/**
 * API Gateway用の標準的なレスポンスを生成します。
 * bodyがオブジェクトの場合は自動的にJSON.stringifyします。
 */
export const apiResponse = (statusCode: number, body: any, methods: string = 'GET,POST,OPTIONS'): APIGatewayProxyResult => {
    // bodyがnullまたはundefinedの場合は空文字にする（OPTIONS等で利用）
    const isEmpty = body === null || body === undefined;
    return {
        statusCode,
        headers: getCorsHeaders(methods),
        body: isEmpty ? '' : (typeof body === 'string' ? body : JSON.stringify(body)),
    };
};

/**
 * 成功時 (200 OK) のレスポンス。
 * bodyを省略した場合は null となり、空文字ボディが返されます。
 */
export const successResponse = (body: any = null, methods: string = 'GET,POST,OPTIONS') => apiResponse(200, body, methods);

/**
 * エラー時 のレスポンス。
 */
export const errorResponse = (statusCode: number, message: string, error?: any, methods: string = 'GET,POST,OPTIONS') => 
    apiResponse(statusCode, { message, ...(error ? { error: String(error) } : {}) }, methods);
