import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    // --- ここに管理者だけができる処理を書く ---
    return {
        statusCode: 200,
        body: JSON.stringify({ message: "Authenticated as Admin" }),
        headers: { 'Access-Control-Allow-Origin': '*' }
    };
};