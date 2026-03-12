/**
 * ファイル概要: ユーザーログインページ
 * 目的: Cognitoを利用した認証機能を提供し、既存ユーザーがショップ管理画面などにアクセスできるようにします。
 */
'use client';

import { useState, useEffect } from 'react';
import { signIn, fetchAuthSession, confirmSignIn, signOut } from 'aws-amplify/auth';
import { useRouter, Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
    const t = useTranslations('LoginPage');
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [mfaCode, setMfaCode] = useState('');
    const [showMfa, setShowMfa] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const session = await fetchAuthSession();
                if (session.tokens) {
                    const groups = (session.tokens.idToken?.payload['cognito:groups'] as string[]) || [];
                    const amr = (session.tokens.idToken?.payload['amr'] as string[]) || [];
                    const isAdmin = groups.includes('Administrators') || groups.includes('GlobalAdmins');
                    const usedMfa = amr.includes('mfa') || amr.includes('software_token_mfa') || amr.includes('sms_mfa');

                    // 管理者でMFAがまだの場合、勝手に/shopに行かずにログインページに留まる（または案内を出す）
                    if (isAdmin && !usedMfa) {
                        console.log("Logged in as admin but MFA is missing.");
                        setIsLoggedIn(true);
                        setIsAdmin(true);
                        return; // ログインページに留まり、MFA設定リンクを踏めるようにする
                    }

                    setIsAdmin(isAdmin);
                    setIsLoggedIn(true);
                    router.replace('/shop');
                }
            } catch (e) {
                // Not logged in
            }
        };
        checkAuth();
    }, [router]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            if (showMfa) {
                // MFAコードの送信
                const { isSignedIn } = await confirmSignIn({
                    challengeResponse: mfaCode
                });
                if (isSignedIn) {
                    router.push('/shop');
                }
                return;
            }

            // 通常のID/PWログイン
            const { isSignedIn, nextStep } = await signIn({ username: email, password });

            if (isSignedIn) {
                router.push('/shop');
            } else {
                if (nextStep.signInStep === 'CONFIRM_SIGN_UP') {
                    router.push(`/verify?username=${encodeURIComponent(email)}`);
                } else if (nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_TOTP_CODE') {
                    // MFA入力画面に切り替え
                    setShowMfa(true);
                } else {
                    setError(`Additional step required: ${nextStep.signInStep}`);
                }
            }
        } catch (err: any) {
            if (err.name === 'NotAuthorizedException' || err.code === 'NotAuthorizedException') {
                setError(t('errors.notAuthorized'));
            } else if (err.name === 'UserNotConfirmedException' || err.code === 'UserNotConfirmedException') {
                setError(t('errors.notConfirmed'));
                router.push(`/verify?username=${encodeURIComponent(email)}`);
            } else if (err.name === 'CodeMismatchException') {
                setError("認証コードが正しくありません。");
            } else {
                console.error('Login error', err);
                setError(err.message || t('errors.default'));
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            {isLoggedIn && (
                <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
                    {isAdmin && (
                        <Link href="/admin">
                            <Button variant="destructive" className="shadow-md">
                                {t('qrAdminPage')}
                            </Button>
                        </Link>
                    )}
                    <Link href="/shop">
                        <Button variant="default" className="shadow-md">
                            {t('shopAdminPage')}
                        </Button>
                    </Link>
                    <Button
                        variant="ghost"
                        className="shadow-md bg-white hover:bg-red-50 hover:text-red-600 border border-gray-200"
                        onClick={async () => {
                            await signOut();
                            setIsLoggedIn(false);
                            setIsAdmin(false);
                        }}
                    >
                        {t('logout')}
                    </Button>
                </div>
            )}
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-center text-2xl">{t('title')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleLogin} className="space-y-4">
                        {!showMfa ? (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="email">{t('email')}</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="you@example.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="password">{t('password')}</Label>
                                    <Input
                                        id="password"
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                    />
                                </div>
                            </>
                        ) : (
                            <div className="space-y-2">
                                <Label htmlFor="mfaCode">2段階認証コード</Label>
                                <Input
                                    id="mfaCode"
                                    type="text"
                                    placeholder="6桁のコード"
                                    value={mfaCode}
                                    onChange={(e) => setMfaCode(e.target.value)}
                                    className="text-center text-2xl tracking-widest"
                                    maxLength={6}
                                    required
                                    autoFocus
                                />
                                <p className="text-xs text-gray-500 text-center">
                                    認証アプリに表示されているコードを入力してください。
                                </p>
                            </div>
                        )}
                        {error && <p className="text-sm text-red-500 text-center font-medium">{error}</p>}
                        <Button type="submit" className="w-full h-11 text-base font-bold" disabled={loading}>
                            {loading ? (showMfa ? "確認中..." : t('signingIn')) : (showMfa ? "認証してログイン" : t('signIn'))}
                        </Button>

                        {/* 生体認証は一旦コメントアウト
                        {!showMfa && (
                            <div className="space-y-4 pt-2">
                                <div className="relative">
                                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                        <div className="w-full border-t border-gray-200"></div>
                                    </div>
                                    <div className="relative flex justify-center text-sm">
                                        <span className="px-2 bg-white text-gray-500">または</span>
                                    </div>
                                </div>
                                <Button 
                                    type="button" 
                                    variant="outline" 
                                    className="w-full h-11 border-blue-600 text-blue-600 hover:bg-blue-50 font-bold"
                                    onClick={async () => {
                                        if (!email) {
                                            setError("生体認証でのログインには、まずメールアドレスを入力してください。");
                                            return;
                                        }
                                        setLoading(true);
                                        setError('');
                                        try {
                                            const { signIn } = await import('aws-amplify/auth');
                                            await signIn({
                                                username: email,
                                                options: {
                                                    authFlowType: 'USER_AUTH',
                                                    preferredChallenge: 'WEB_AUTHN',
                                                },
                                            });
                                        } catch (err: any) {
                                            console.error('Passkey sign-in failed', err);
                                            setError("生体認証に失敗しました。デバイスが未登録か、非対応です。");
                                        } finally {
                                            setLoading(false);
                                        }
                                    }}
                                    disabled={loading}
                                >
                                    顔認証・指紋認証でログイン
                                </Button>
                            </div>
                        )}
                        */}
                        {showMfa && (
                            <Button
                                type="button"
                                variant="ghost"
                                className="w-full text-gray-500"
                                onClick={() => setShowMfa(false)}
                            >
                                戻る
                            </Button>
                        )}
                    </form>
                </CardContent>
                <CardFooter className="flex-col gap-4">
                    <p className="text-sm text-gray-500">
                        {t('noAccount')} <Link href="/register" className="text-blue-600 hover:underline">{t('signUpLink')}</Link>
                    </p>
                    <div className="pt-2 border-t w-full text-center">
                        <Link href="/mfa-setup" className="text-sm text-gray-500 hover:text-blue-600 transition-colors">
                            {t('mfaLink')}
                        </Link>
                    </div>
                </CardFooter>
            </Card>
        </div>
    );
}
