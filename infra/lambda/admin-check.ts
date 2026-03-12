import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log("Lambda起動テスト: 受信したイベント", JSON.stringify(event));

    // --- ここに管理者だけができる処理を書く ---
    return {
        statusCode: 200,
        body: JSON.stringify({ message: "管理者として認証されました！" }),
        headers: { 'Access-Control-Allow-Origin': '*' }
    };
};