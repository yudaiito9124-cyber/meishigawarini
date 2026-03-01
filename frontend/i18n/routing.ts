/**
 * ファイル概要: next-intlのルーティング設定ファイル
 * 目的: サポートするロケール(en, ja)やデフォルトロケールの定義、および国際化対応のナビゲーションAPI(Link, useRouterなど)をエクスポートします。
 */
import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

export const routing = defineRouting({
    // A list of all locales that are supported
    locales: ['en', 'ja'],

    // Used when no locale matches
    defaultLocale: 'ja',

    localePrefix: 'never'
});

// Lightweight wrappers around Next.js' navigation APIs
// that will consider the routing configuration
export const { Link, redirect, usePathname, useRouter, getPathname } =
    createNavigation(routing);
