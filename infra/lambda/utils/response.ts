/**
 * @file response.ts
 * @role API レスポンス生成ユーティリティ
 * @responsibility
 *  - API Gateway 向けの標準的なレスポンス形式（APIGatewayProxyResult）を生成します。
 *  - 全てのレスポンスに対して適切な CORS ヘッダーを付与し、フロントエンドからの安全なアクセスを許可します。
 *  - HTTP ステータスコードに応じた成功・エラーレスポンスの生成を抽象化します。
 * @context
 *  - Lambda 関数の return 文で使用され、フロントエンドへの最終的な応答を構築します。
 */

import { APIGatewayProxyResult } from 'aws-lambda';
import { ALL_ALLOW_HEADERS, joinHeaders } from '../../../shared/constants';

/**
 * 全てのレスポンスに共通して付与すべき CORS ヘッダーを取得します。
 * 
 * @param methods - 許可する HTTP メソッド（カンマ区切り）。デフォルトは 'GET,POST,OPTIONS'。
 * @returns レスポンスヘッダーオブジェクト。
 */
export const getCorsHeaders = (methods: string = 'GET,POST,OPTIONS') => ({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': joinHeaders(ALL_ALLOW_HEADERS),
    'Access-Control-Allow-Methods': methods
});

/**
 * API Gateway 用の低レベルレスポンス生成関数です。
 * 
 * @description
 * - ボディがオブジェクトの場合は自動的に JSON.stringify してシリアライズします。
 * - ボディが null または undefined の場合は空文字をセットします（主に OPTIONS リクエストの応答用）。
 * 
 * @param statusCode - HTTP ステータスコード (200, 400, 500 等)。
 * @param body - 返却するデータオブジェクトまたは文字列。
 * @param methods - CORS で許可するメソッド。
 * @returns APIGatewayProxyResult オブジェクト。
 */
export const apiResponse = (statusCode: number, body: any, methods: string = 'GET,POST,OPTIONS'): APIGatewayProxyResult => {
    const isEmpty = body === null || body === undefined;
    return {
        statusCode,
        headers: getCorsHeaders(methods),
        body: isEmpty ? '' : (typeof body === 'string' ? body : JSON.stringify(body)),
    };
};

/**
 * 成功時 (200 OK) のレスポンスを生成します。
 * 
 * @param body - フロントエンドへ返却するデータ。
 * @param methods - 許可メソッド。
 */
export const successResponse = (body: any = null, methods: string = 'GET,POST,OPTIONS') => apiResponse(200, body, methods);

/**
 * エラー時のレスポンスを生成します。
 * 
 * @description
 * 統一されたエラーフォーマット `{ message, error }` を返却します。
 * 
 * @param statusCode - HTTP エラーステータスコード。
 * @param message - ユーザー・開発者向けのサマリーメッセージ。
 * @param error - 詳細なエラー情報または StackTrace（オプション）。
 * @param methods - 許可メソッド。
 */
export const errorResponse = (statusCode: number, message: string, error?: any, methods: string = 'GET,POST,OPTIONS') =>
    apiResponse(statusCode, { message, ...(error ? { error: String(error) } : {}) }, methods);
