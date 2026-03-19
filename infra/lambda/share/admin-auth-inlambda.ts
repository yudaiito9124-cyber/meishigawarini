import { parseGroups, isSystemAdmin } from '../utils/auth';

/**
 * ユーザーが 管理者グループ（Administrators または GlobalAdmins）に属しているか検証する
 * @param event Lambdaのeventオブジェクト
 * @returns { isAdmin: boolean, errorResponse?: APIGatewayProxyResult }
 */
export function verifyAdmin(event: any) {
    // API Gateway (Cognito Authorizer) から渡されるグループ情報を取得
    const groupsField = event.requestContext?.authorizer?.claims?.['cognito:groups'];
    const groups = parseGroups(groupsField);

    if (!isSystemAdmin(groups)) {
        console.log("Unauthorized access attempt. Admin group not found in:", groups);

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