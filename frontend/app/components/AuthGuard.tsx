/**
 * ファイル概要: 認証ガードコンポーネント (AuthGuard)
 * 
 * 役割:
 * クライアントサイドで現在のユーザーセッションを確認し、
 * 未ログインの場合はログインページへ即座にリダイレクトします。
 */
"use client";

import { useState, useEffect, useRef } from "react";
import { getCurrentUser } from 'aws-amplify/auth';
import { useRouter } from "@/i18n/routing";
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

interface AuthGuardProps {
    children: React.ReactNode;
    loadingMessage?: string;
    redirectTo?: string;
}

export default function AuthGuard({
    children,
    loadingMessage,
    redirectTo = "/login",
}: AuthGuardProps) {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
    const hasCheckedAuth = useRef(false);
    const router = useRouter();
    const t = useTranslations('Common');

    useEffect(() => {
        if (hasCheckedAuth.current) return;
        hasCheckedAuth.current = true;

        const checkAuth = async () => {
            console.log("[AuthGuard] Checking session...");

            /**
             * 高速判定 (Fast Path):
             * Amplifyの非同期処理を待つ前に、ローカルストレージにCognitoのトークンらしきものがあるか確認します。
             * 全く存在しない場合は、未ログインとみなして即座にリダイレクトします。
             */
            const hasPossibleToken = Object.keys(localStorage).some(key => 
                key.includes('CognitoIdentityServiceProvider') && key.includes('idToken')
            );

            if (!hasPossibleToken) {
                console.log("[AuthGuard] No local tokens found. Redirecting immediately.");
                router.push(redirectTo);
                return;
            }

            try {
                // トークンがある可能性がある場合のみ、実際にAmplifyでセッションを確認します。
                // 10秒などの長い待機は行わず、Amplify自体の判定に任せます。
                await getCurrentUser();
                console.log("[AuthGuard] Auth check successful");
                setIsAuthenticated(true);
            } catch (error) {
                console.warn("[AuthGuard] Auth check failed:", error);
                router.push(redirectTo);
            }
        };

        checkAuth();
    }, [router, redirectTo]);

    // 判定中の表示（ごく短時間のみ表示される想定）
    if (isAuthenticated === null) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50/50 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-primary opacity-80" />
                    <p className="text-sm font-medium text-muted-foreground">
                        {loadingMessage || t('loading')}
                    </p>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
