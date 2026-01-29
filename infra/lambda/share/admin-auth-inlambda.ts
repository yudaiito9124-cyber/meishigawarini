/**
 * ユーザーが Administrators グループに属しているか検証する
 * @param event Lambdaのeventオブジェクト
 * @returns { isAdmin: boolean, errorResponse?: APIGatewayProxyResult }
 */
export function verifyAdmin(event: any) {
    // API Gateway (Cognito Authorizer) から渡されるグループ情報を取得
    const groups = event.requestContext?.authorizer?.claims['cognito:groups'] || [];

    // CDKで作成した 'Administrators' グループ名と一致させる
    if (!groups.includes('Administrators')) {
        console.log("Unauthorized access attempt. Group 'Administrators' not found in:", groups);

        return {
            isAdmin: false,
            errorResponse: {
                statusCode: 404, // 403を隠して404を返す
                body: JSON.stringify({ message: "Not Found" }),
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*", // CORS対応
                }
            }
        };
    }

    return { isAdmin: true };
}