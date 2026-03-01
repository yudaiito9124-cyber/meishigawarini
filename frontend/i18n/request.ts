/**
 * ファイル概要: next-intlのリクエスト設定ファイル
 * 目的: ユーザーのロケール判定と対応するメッセージカタログ(JSON)の動的読み込みを行い、国際化の基本設定を提供します。
 */
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
    // This typically corresponds to the `[locale]` segment
    let locale = await requestLocale;

    // Ensure that a valid locale is used
    if (!locale || !routing.locales.includes(locale as any)) {
        locale = routing.defaultLocale;
    }

    return {
        locale,
        messages: (await import(`../messages/${locale}.json`)).default
    };
});
