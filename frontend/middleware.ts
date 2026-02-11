import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const handleI18nRouting = createMiddleware(routing);

export function middleware(request: NextRequest) {
    const host = request.headers.get('host');
    const newDomain = 'meishigawarini.com';

    // 1. ドメインリダイレクト判定 (i18n処理の前に実行)
    // 旧ドメイン（amplifyapp.com）からのアクセスの場合は、新ドメインへ301転送
    if (host && host.includes('amplifyapp.com')) {
        const url = request.nextUrl.clone();
        url.host = newDomain;
        url.protocol = 'https';
        return NextResponse.redirect(url, 301);
    }

    // 2. i18n ルーティング処理
    return handleI18nRouting(request);
}

export const config = {
    // 静的ファイルやAPI以外のすべてのパスに適用
    matcher: [
        '/((?!api|_next|_vercel|.*\\..*).*)',
    ]
};