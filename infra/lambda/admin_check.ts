/**
 * 概要: 管理者認証の有効性を確認するためのチェック用エンドポイント。
 * 詳細: API Gatewayのオーソライザー経由で呼び出され、管理者が正しく認証されている場合に成功レスポンスを返す。
 * エンドポイント: GET /admin
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    // --- ここに管理者だけができる処理を書く ---
    return {
        statusCode: 200,
        body: JSON.stringify({ message: "Authenticated as Admin" }),
        headers: { 'Access-Control-Allow-Origin': '*' }
    };
};