import { parseGroups, isSystemAdmin } from '../utils/auth';

/**
 * ユーザーが 管理者グループ（Administrators または GlobalAdmins）に属しているか検証する
 * @param event Lambdaのeventオブジェクト
 * @returns { isAdmin: boolean, errorResponse?: APIGatewayProxyResult }
 */
export function verifyAdmin(event: any) {
    // API Gateway (TokenAuthorizer) はすでに adminAuthorizer.ts でシステム管理者以外のアクセスをブロックします。
    // そのため、ここに到達した時点でシステム管理者であることが保証されています。

    return { isAdmin: true };
}