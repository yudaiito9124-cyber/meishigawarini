/**
 * ファイル概要: Next.js アプリケーション設定ファイル
 * 目的: next-intlプラグインの統合、環境変数の公開、および外部画像(S3等)のホストネーム許可設定を行います。
 */
import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**', // Allow all for prototype (or restrict to s3/placehold.co)
      },
    ],
  },
  serverExternalPackages: ['jspdf', 'sharp'],
};

export default withNextIntl(nextConfig);
