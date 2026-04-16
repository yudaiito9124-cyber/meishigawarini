/**
 * ファイル概要: 管理画面ゲートキーパー・レイアウト
 * 
 * 役割:
 * `/admin` 配下のすべてのルートに対して、厳格な管理者権限チェックと
 * セキュリティポリシー（2FA強制）を同時に適用します。
 * 
 * 判定ロジック:
 * 1. ログイン情報の有無をブラウザストレージで高速チェック（非ログインなら即404）
 * 2. システム管理グループの所属確認
 * 3. バックエンドAPIでの実権限検証
 * 4. 2FA (MFA) の実施確認。未実施の場合は /mfa-setup へ誘導。
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
            console.log("[AdminLayout] Starting secure check...");

            // ━━━ STEP 1: Fast Path (非ログイン者の即時排除) ━━━
            const hasPossibleToken = Object.keys(localStorage).some(key => 
                key.includes('CognitoIdentityServiceProvider') && key.includes('idToken')
            );

            if (!hasPossibleToken) {
                console.log("[AdminLayout] No local tokens. 404 instantly.");
                setIsAuthorized(false);
                return;
            }

            try {
                // ━━━ STEP 2: 基本セッションと権限グループの確認 ━━━
                let session = await fetchAuthSession();
                let payload = session.tokens?.idToken?.payload || {};
                const groups = (payload['cognito:groups'] as string[]) || [];
                const isAdmin = groups.includes('Administrators') || groups.includes('GlobalAdmins');

                if (!isAdmin) {
                    console.log("[AdminLayout] User is not an admin.");
                    setIsAuthorized(false);
                    return;
                }

                // ━━━ STEP 3: APIによる実証と2FA強制チェック ━━━
                const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";
                let token = session.tokens?.idToken?.toString();

                const callAdminApi = (tkn: string) => fetch(`${NEXT_PUBLIC_API_URL}/admin`, {
                    headers: { "authorization": `Bearer ${tkn}` }
                });

                let res = await callAdminApi(token || "");

                // API成功 = 全ての条件（管理権限 + 2FA通過）を満たしている
                if (res.ok) {
                    setIsAuthorized(true);
                    return;
                }

                // API失敗時: 2FAが理由かどうかを精査する
                console.log("[AdminLayout] API check failed. Verifying 2FA status...");
                let amr = (payload['amr'] as string[]) || [];

                // amrが空、またはmfaが含まれていない場合は再確認を行う
                if (amr.length === 0 || !amr.includes('mfa')) {
                    console.log("[AdminLayout] MFA claims not found in token. Attempting force refresh...");
                    
                    // Cognitoから最新の認証情報を強制再取得（ネットワーク通信が発生）
                    const refreshedSession = await fetchAuthSession({ forceRefresh: true });
                    const refreshedPayload = refreshedSession.tokens?.idToken?.payload || {};
                    const refreshedAmr = (refreshedPayload['amr'] as string[]) || [];
                    const refreshedToken = refreshedSession.tokens?.idToken?.toString();

                    // 再取得したトークンでAPIを再試行
                    const resRetry = await callAdminApi(refreshedToken || "");
                    if (resRetry.ok) {
                        setIsAuthorized(true);
                        return;
                    }

                    // それでもMFAがなければリダイレクト
                    if (!refreshedAmr.includes('mfa')) {
                        console.log("[AdminLayout] 2FA is strictly required.");
                        alert(t("AdminNeed2FA"));
                        router.push("/mfa-setup");
                        // リダイレクト中はloading画面を維持するため state は更新しない
                        return;
                    }
                }

                // 2FAは通っているがAPIが通らない場合は、純粋な権限不足
                setIsAuthorized(false);

            } catch (e) {
                console.error("[AdminLayout] Exception during auth check:", e);
                setIsAuthorized(false);
            }
        };

        checkAuth();
    }, [router, t]);

    // 判定中
    if (isAuthorized === null) {
        return (
            <div className="min-h-screen bg-mist-900 flex items-center justify-center text-white">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-white opacity-80" />
                    <p className="text-sm font-medium opacity-70">{t('verifyingAdmin')}</p>
                </div>
            </div>
        );
    }

    // 権限なし (404表示)
    if (isAuthorized === false) {
        notFound();
        return null;
    }

    // 認証成功
    return (
        <div className="min-h-screen bg-mist-900">
            {children}
        </div>
    );
}
