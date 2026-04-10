/**
 * ファイル概要: 全画面共通ルートレイアウト (Root Layout)
 * 
 * 役割:
 * アプリケーション全体の基盤となる HTML 構造およびグローバルコンテキストを定義します。
 * 
 * 主要機能:
 * 1. フォント・スタイル: Geist Sans/Mono フォントの最適化読み込みと Tailwind グローバルスタイルの適用。
 * 2. 認証基盤: `ConfigureAmplify` を介した AWS Amplify (Cognito/Storage) のクライアントサイド初期化。
 * 3. 多言語対応: `NextIntlClientProvider` によるロケールコンテキストの注入。
 * 4. SEO/UX: `generateMetadata` による動的タイトル生成と、モバイル端末向けのビューポート固定設定。
 * 5. 共通コンポーネント: ヘルプボタン、フッターなどの永続的 UI 部品の配置。
 */

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "../globals.css";
import ConfigureAmplify from '../components/ConfigureAmplify';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '../../i18n/routing';
import { HelpButton } from '@/components/HelpButton';
import { SiteFooter } from '@/components/SiteFooter';

/** 
 * Geist Sans: 現代的なサンセリフ体フォントの読み込み 
 */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

/** 
 * Geist Mono: プログラミング・等幅向けのフォント読み込み 
 */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import { getTranslations } from 'next-intl/server';

/** 
 * ビューポート設定: モバイルでのズーム動作を制御 
 */
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

/**
 * 動的なメタデータの生成 (SEO 対応)
 * ロケールに基づいて各言語のタイトルや説明文を取得します。
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  return {
    metadataBase: new URL(NEXT_PUBLIC_APP_URL),
    title: t('title'),
    description: t('description'),
  };
}

/**
 * ルートレイアウトコンポーネント (サーバーコンポーネント)
 */
export default async function RootLayout({
  children,
  params
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  // 1. ロケールの妥当性チェック
  if (!routing.locales.includes(locale as any)) {
    notFound();
  }

  // 2. 翻訳メッセージとサイト基本設定の取得
  const messages = await getMessages();
  const ts = await getTranslations('Site');

  return (
    <html lang={locale} className="scroll-smooth" data-scroll-behavior="smooth" suppressHydrationWarning={true}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <NextIntlClientProvider messages={messages}>
          {/* Amplify 設定のサイドエフェクト実行用コンポーネント */}
          <ConfigureAmplify />
          
          {/* ページ固有のコンテンツ */}
          {children}
          
          {/* ━━━ 全画面共通 UI ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          
          {/* ヘルプセンターへのフローティングボタン */}
          <HelpButton />
          
          {/* 共通フッター (SiteFooter) */}
          <SiteFooter siteName={ts('name')} />
          
          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

