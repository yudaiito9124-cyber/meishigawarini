/**
 * ファイル概要: ユーザー認可レイアウト (User Guard Layout) 
 * 
 * 役割:
 * `/user` 配下のすべてのページに対して、共通の外部認証ガード (AuthGuard) を適用します。
 */
"use client";

import AuthGuard from '@/app/components/AuthGuard';
import { useTranslations } from 'next-intl';

export default function UserLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // 共通の翻訳を取得
    const t = useTranslations('Common');

    return (
        <AuthGuard loadingMessage={t('loading')}>
            {children}
        </AuthGuard>
    );
}
