/**
 * Cognito のグループ情報をパースするユーティリティ
 * API Gateway の Cognito Authorizer (claims) では カンマ区切りの文字列、
 * Lambda Authorizer (context) や直接の JWT ペイロードでは 配列として渡される可能性があるため、
 * それらを統一的に配列として扱うための関数です。
 */
export function parseGroups(groupsField: any): string[] {
    if (!groupsField) return [];
    
    // すでに配列の場合はそのまま返す
    if (Array.isArray(groupsField)) {
        return groupsField.map(g => String(g).trim());
    }
    
    // 文字列の場合はカンマで分割してトリムする
    if (typeof groupsField === 'string') {
        // "[ \"Group1\", \"Group2\" ]" のような JSON 文字列の場合もあるためパースを試みる
        if (groupsField.startsWith('[') && groupsField.endsWith(']')) {
            try {
                const parsed = JSON.parse(groupsField);
                if (Array.isArray(parsed)) {
                    return parsed.map(g => String(g).trim());
                }
            } catch (e) {
                // パース失敗時は通常の文字列として扱う
            }
        }
        
        return groupsField.split(',').map(g => g.trim()).filter(Boolean);
    }
    
    return [];
}

/**
 * ユーザーがシステム管理者（Administrators または GlobalAdmins）であるか確認する
 */
export function isSystemAdmin(groups: string[]): boolean {
    return groups.includes('Administrators') || groups.includes('GlobalAdmins');
}

/**
 * ユーザーがグローバル管理者（全ショップへのアクセス権限を持つ）であるか確認する
 */
export function isGlobalAdmin(groups: string[]): boolean {
    return groups.includes('GlobalAdmins');
}
