import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { verifyAdmin } from './share/admin-auth-inlambda';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log("Lambda起動テスト: 受信したイベント", JSON.stringify(event)); // ★これを追加
    // 最初にadmin権限をチェック
    const { isAdmin, errorResponse } = verifyAdmin(event);
    // 管理者でなければ、ここで処理を終了して404を返す
    if (!isAdmin) {
        return errorResponse!;
    }

    // --- ここに管理者だけができる処理を書く ---
    return {
        statusCode: 200,
        body: JSON.stringify({ message: "管理者として認証されました！" }),
        headers: { 'Access-Control-Allow-Origin': '*' }
    };
};