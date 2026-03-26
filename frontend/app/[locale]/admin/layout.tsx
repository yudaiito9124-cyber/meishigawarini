/**
 * ファイル概要: 管理画面共通レイアウト (Gatekeeper)
 * 目的: /admin 配下のすべてのページに対して、管理者権限のチェックと共通のUI構造を提供します。
 */
"use client";

import { useState, useEffect, useRef } from "react";
import { fetchAuthSession } from 'aws-amplify/auth';
import { notFound, useRouter } from "next/navigation";
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const t = useTranslations('AdminPage');
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
    const hasCheckedAuth = useRef(false);
    const router = useRouter();

    useEffect(() => {
        if (hasCheckedAuth.current) return;
        hasCheckedAuth.current = true;

        const checkAuth = async () => {
            let session;
            try {
                session = await fetchAuthSession();
            } catch (e) {
                console.error("Admin Auth Check Error:", e);
                setIsAuthorized(false);
                return;
            }

            let payload = session.tokens?.idToken?.payload || {};
            let groups = (payload['cognito:groups'] as string[]) || [];
            const isAdmin = groups.includes('Administrators') || groups.includes('GlobalAdmins');

            if (!isAdmin) {
                setIsAuthorized(false);
                return;
            }


            // 管理者の権限はあるが２段階認証については不明
            let pushtomfasetup = true;
            let apiSuccess = false;
            try {
                let amr = (payload['amr'] as string[]) || [];
                if (amr.length === 0) {
                    session = await fetchAuthSession({ forceRefresh: true });
                    payload = session.tokens?.idToken?.payload || {};
                    amr = (payload['amr'] as string[]) || [];
                }

                const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";
                const token = session.tokens?.idToken?.toString();

                const res = await fetch(`${NEXT_PUBLIC_API_URL}/admin`, {
                    headers: { "Authorization": `Bearer ${token}` }
                });

                if (res.ok) {
                    apiSuccess = true;
                    pushtomfasetup = false;
                }
            } catch (e) {
            } finally {
                if (pushtomfasetup) {
                    alert(t("AdminNeed2FA"));
                    router.push("/mfa-setup");
                    // リダイレクト中なので、isAuthorizedをfalseにしない（loading画面のまま維持）
                } else {
                    setIsAuthorized(apiSuccess);
                }
            }
        };

        checkAuth();
    }, [router, t]);

    if (isAuthorized === null) {
        return (
            <div className="min-h-screen bg-mist-900 flex items-center justify-center text-white">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-white opacity-80" />
                    <p className="text-sm font-medium opacity-70">Verifying Admin Access...</p>
                </div>
            </div>
        );
    }

    if (isAuthorized === false) {
        router.push('/login');
        return null;
    }

    return (
        <div className="min-h-screen bg-mist-900">
            {children}
        </div>
    );
}
