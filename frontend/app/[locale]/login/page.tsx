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
import { cn } from '@/lib/utils';
import { shopApi } from '@/lib/api/shop';
import { HelpCircle, Crown, Store } from 'lucide-react';

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
    const [userEmail, setUserEmail] = useState('');
    const [userInfo, setUserInfo] = useState('');
    const [singleShopOwner, setSingleShopOwner] = useState<boolean>(true);
    const [isAdmin, setIsAdmin] = useState(false);

    const checkAuth = async () => {
        try {
            const session = await fetchAuthSession();
            if (session.tokens) {
                const groups = (session.tokens.idToken?.payload['cognito:groups'] as string[]) || [];
                const amr = (session.tokens.idToken?.payload['amr'] as string[]) || [];
                const isAdmin = groups.includes('Administrators') || groups.includes('GlobalAdmins');
                const usedMfa = amr.includes('mfa') || amr.includes('software_token_mfa') || amr.includes('sms_mfa');

                // 管理者でMFAがまだの場合、勝手に/shopに行かずにログインページに留まる（または案内を出す）
                if (isAdmin) {
                    // console.log("Logged in as admin but MFA is missing.");
                    setIsLoggedIn(true);
                    setIsAdmin(true);
                    setUserInfo(groups.join(" & "));
                    setUserEmail(session.tokens.idToken?.payload["email"] as string || "")
                    setSingleShopOwner(false);
                    return; // ログインページに留まり、MFA設定リンクを踏めるようにする
                }

                setIsAdmin(isAdmin);
                setIsLoggedIn(true);
                await redirectShopPage();
            }
        } catch (e) {
            // Not logged in
        }
    };

    const redirectShopPage = async () => {
        setLoading(true);
        try {
            const data = await shopApi.shop_list({});
            const shops = data.shops || [];

            // Auto-redirect if SHOP_MANAGER and has exactly one shop
            if (shops.length === 1) {
                setSingleShopOwner(true);
                const shopId = shops[0].id;
                router.push(`/shop/${shopId}`);
                console.log("replace")
                return;
            }
            setSingleShopOwner(false);
            router.push('/shop');
            console.log("replace2")
        } catch (e) {
            // console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        checkAuth();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
                    await checkAuth(); // checkAuth内でredirectShopPageも呼ばれる
                }
                return;
            }

            // 通常のID/PWログイン
            const { isSignedIn, nextStep } = await signIn({ username: email, password });

            if (isSignedIn) {
                await checkAuth(); // checkAuth内でredirectShopPageも呼ばれる
                return;
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
                setError(t('errors.invalidAuthCode'));
            } else {
                // console.error('Login error', err);
                setError(err.message || t('errors.default'));
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={cn("min-h-screen flex items-center justify-center bg-gray-100 p-4", isAdmin && "bg-mist-900")}>
            {isLoggedIn && (
                <div className="fixed top-0 p-4 z-50 flex w-full items-center gap-2 flex-wrap justify-between">
                    {isAdmin && (
                        <div className="flex gap-2 flex-col items-start">
                            <Link href="/help/admin">
                                <Button variant="ghost" className="shadow-md cursor-pointer text-white h-10 flex items-center gap-1.5 px-3 w-40">
                                    <HelpCircle className="size-5" />
                                    <span className="text-xs font-bold">{t('helpAdminPage')}</span>
                                </Button>
                            </Link>
                            <Link href="/admin">
                                <Button variant="destructive" className="shadow-md cursor-pointer border border-red-900 h-40 w-40 flex flex-col items-center justify-center p-2 hover:bg-red-700 transition-colors">
                                    <Crown className="size-18 drop-shadow-md stroke-[2]" />
                                    <div className='font-bold text-lg leading-tight text-center mt-1'>{t('qrAdminPage')}</div>
                                </Button>
                            </Link>
                        </div>
                    )}
                    <div className="flex gap-2 flex-col items-start">
                        <Button
                            variant="ghost"
                            className="hover:bg-red-50 hover:text-red-600 cursor-pointer text-white justify-end w-40 justify-center"
                            onClick={async () => {
                                await signOut();
                                setIsLoggedIn(false);
                                setIsAdmin(false);
                            }}
                        >
                            {t('logout')}
                        </Button>
                        {!singleShopOwner && (
                            <Link href="/shop">
                                <Button variant="secondary" className="shadow-md cursor-pointer border border-gray-200 flex flex-col items-center gap-2 font-bold h-10 px-4 w-40 h-40">
                                    <Store className="size-18 drop-shadow-md stroke-[1.5]" />
                                    <div className='font-bold text-lg leading-tight text-center mt-1'>{t('shopAdminPage')}</div>
                                </Button>
                            </Link>
                        )}
                    </div>
                </div>
            )}
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-center text-2xl whitespace-pre-wrap">{isAdmin ? `Admin \n\n${userEmail}` : t('title')}</CardTitle>
                </CardHeader>
                <CardContent>
                    {!isAdmin && (

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
                                    <Label htmlFor="mfaCode">{t('mfaCodeLabel')}</Label>
                                    <Input
                                        id="mfaCode"
                                        type="text"
                                        placeholder={t('mfaPlaceholder')}
                                        value={mfaCode}
                                        onChange={(e) => setMfaCode(e.target.value)}
                                        className="text-center text-2xl tracking-widest"
                                        maxLength={6}
                                        required
                                        autoFocus
                                    />
                                    <p className="text-xs text-gray-500 text-center">
                                        {t('mfaInstructions')}
                                    </p>
                                </div>
                            )}
                            {error && <p className="text-sm text-red-500 text-center font-medium">{error}</p>}
                            <Button type="submit" className="w-full h-11 text-base font-bold" disabled={loading}>
                                {loading ? (showMfa ? t('verifyingMfa') : t('signingIn')) : (showMfa ? t('verifyAndSignIn') : t('signIn'))}
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
                                    {t('back')}
                                </Button>
                            )}
                        </form>
                    )}
                    {isAdmin && (
                        <>
                            <p className="text-sm text-gray-500 text-center">
                                Your roles : <br />
                                {userInfo}
                            </p>
                        </>
                    )}
                </CardContent>
                <CardFooter className="flex-col gap-4">
                    {!isAdmin && (
                        <p className="text-sm text-gray-500">
                            {t('noAccount')} <Link href="/register" className="text-blue-600 hover:underline">{t('signUpLink')}</Link>
                        </p>
                    )}
                    {isAdmin && (
                        <div className="pt-2 border-t w-full text-center">
                            <Link href="/mfa-setup" className="text-sm text-gray-500 hover:text-blue-600 transition-colors">
                                {t('mfaLink')}
                            </Link>
                        </div>
                    )}
                </CardFooter>
            </Card>
        </div>
    );
}
