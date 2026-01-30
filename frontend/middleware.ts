import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const handleI18nRouting = createMiddleware(routing);

export function middleware(request: NextRequest) {
    // // Only restrict /admin routes
    // if (request.nextUrl.pathname.startsWith('/admin')) {
    //     const allowedIps = ['115.65.249.220', '127.0.0.1', '::1'];
    //
    //     // Get IP from headers (standard for behind proxies like Amplify/Vercel)
    //     const forwardedFor = request.headers.get('x-forwarded-for');
    //
    //     // x-forwarded-for can be a comma-separated list, we take the first one (original client)
    //     const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1';
    //
    //     if (!allowedIps.includes(ip)) {
    //         console.warn(`Blocked access to admin from IP: ${ip}`);
    //         return new NextResponse('Access Denied', { status: 403 });
    //     }
    // }

    return handleI18nRouting(request);
}

export const config = {
    // Match all pathnames except for
    // - … if they start with `/api`, `/_next` or `/_vercel`
    // - … the ones containing a dot (e.g. `favicon.ico`)
    matcher: [
        '/((?!api|_next|_vercel|.*\\..*).*)',
        // However, match all pathnames within `/users`, optionally with a locale prefix
        // '/([\\w-]+)?/users/(.+)'
    ]
};
