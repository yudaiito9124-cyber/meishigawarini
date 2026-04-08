import { useTranslations } from 'next-intl';

/**
 * バックエンドからのエラーメッセージを安全なキー（スネークケース）に変換して翻訳するフックです。
 * 
 * 使い方:
 * const { translateError } = useBackendError();
 * alert(translateError(err.message, err.detail));
 */
export function useBackendError() {
    const tb = useTranslations('Backend');

    const translateError = (message?: string, detail?: string) => {
        if (!message) return "";

        // スラッグ化: 小文字変換、記号やスペースをアンダースコアに置換、連続するアンダースコアを統合
        const slug = message
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');

        try {
            // tb(slug) を呼び出す。next-intl はキーが見つからない場合、
            // 設定によってはキー自体を返すか、フォールバックメッセージを返す
            const translated = tb(slug);

            // ルックアップ失敗判定: 
            // tb(slug) が slug そのものを返してきた場合は未定義とみなす
            if (translated === slug) {
                return message + (detail ? ` (${detail})` : '');
            }

            return translated + (detail ? ` (${detail})` : '');
        } catch (e) {
            // next-intl がエラーを投げる設定の場合のフォールバック
            return message + (detail ? ` (${detail})` : '');
        }
    };

    return { translateError, tb };
}
