/**
 * ファイル概要: バックエンドエラー翻訳用カスタムフック (Backend Error Translation Hook)
 * 
 * 役割:
 * バックエンド API から返されたエラー文字列（例: "USER_NOT_FOUND" や "Internal Server Error"）を
 * フロントエンドの多言語対応（i18n）用キーに変換し、ユーザーに分かりやすい言語で翻訳します。
 * 
 * 主要機能:
 * 1. エラーメッセージの正規化（スラッグ化）: 記号や空白をアンダースコアに変換。
 * 2. `next-intl` (`useTranslations('Backend')`) を使用した動的ルックアップ。
 * 3. 翻訳キーが見つからない場合のフォールバック（原文 + 詳細メッセージの表示）。
 */

import { useTranslations } from 'next-intl';

/**
 * バックエンドからのエラーメッセージを安全なキー（スネークケース）に変換して翻訳します。
 * 
 * 使い方:
 * ```tsx
 * const { translateError } = useBackendError();
 * 
 * try {
 *   await api.submit();
 * } catch (err) {
 *   toast.error(translateError(err.message, err.detail));
 * }
 * ```
 * 
 * @returns { translateError, tb } 翻訳関数と `next-intl` のインスタンス
 */
export function useBackendError() {
    /** `messages/[locale].json` の `Backend` セクションを使用 */
    const tb = useTranslations('Backend');

    /**
     * メッセージを翻訳します。
     * 
     * @param message エラーメッセージ (例: "Access Denied")
     * @param detail エラー詳細 (任意。カッコ内に表示されます)
     * @returns 翻訳後の文字列、またはフォールバック文字列
     */
    const translateError = (message?: string, detail?: string) => {
        if (!message) return "";

        /**
         * スラッグ化処理:
         * 1. 小文字変換
         * 2. 英数字以外の記号やスペースをアンダースコアに置換
         * 3. 連続するアンダースコアを一つに統合
         * 4. 先頭と末尾のアンダースコアを除去
         * 
         * 例: "User not-found!" -> "user_not_found"
         */
        const slug = message
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');

        try {
            /** 
             * next-intl でのキー検索。
             * キーが見つからない場合、設定によってはキー名そのものが返される。
             */
            const translated = tb(slug);

            // ルックアップ失敗判定: 
            // 翻訳結果がスラッグそのままである場合、辞書に未登録と判断
            if (translated === slug) {
                return message + (detail ? ` (${detail})` : '');
            }

            return translated + (detail ? ` (${detail})` : '');
        } catch (e) {
            // next-intl の実行時エラーに対する安全なフォールバック
            return message + (detail ? ` (${detail})` : '');
        }
    };

    return { translateError, tb };
}

