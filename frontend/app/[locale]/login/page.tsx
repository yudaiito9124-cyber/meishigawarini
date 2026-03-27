/**
 * ファイル概要: ユーザーログインページ
 * 目的: Cognitoを利用した認証機能を提供し、既存ユーザーがショップ管理画面などにアクセスできるようにします。
 */
'use client';

import { useState, useEffect } from 'react';
import { signIn, fetchAuthSession, confirmSignIn, signOut, signInWithRedirect } from 'aws-amplify/auth';
import { useRouter, Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from '@/lib/utils';
import { shopApi } from '@/lib/api/shop';
import { HelpCircle, Crown, Store, Loader2, User } from 'lucide-react';

export default function LoginPage() {
    const t = useTranslations('LoginPage');
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [mfaCode, setMfaCode] = useState('');
    const [showMfa, setShowMfa] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [userEmail, setUserEmail] = useState('');
    const [userId, setUserId] = useState('');
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
                const sub = session.tokens.idToken?.payload['sub'] as string || "";
                
                setUserId(sub);
                setIsAdmin(isAdmin);
                setIsLoggedIn(true);

                // 管理者でMFAがまだの場合
                if (isAdmin) {
                    setUserInfo(groups.join(" & "));
                    setUserEmail(session.tokens.idToken?.payload["email"] as string || "")
                    setSingleShopOwner(false);
                    setLoading(false);
                    return; 
                }

                await redirectShopPage();
            } else {
                setLoading(false);
            }
        } catch (e) {
            setLoading(false);
        }
    };

    const redirectShopPage = async () => {
        setLoading(true);
        try {
            const data = await shopApi.shop_list({});
            const shops = data.shops || [];

            if (shops.length === 1) {
                setSingleShopOwner(true);
                // No longer pushing automatically
                // const shopId = shops[0].id;
                // router.push(`/shop/${shopId}`);
            } else {
                setSingleShopOwner(false);
                // router.push('/shop');
            }
        } catch (e) {
            // console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        checkAuth();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const { locale } = useParams();

    const handleHostedUILogin = async () => {
        try {
            await signInWithRedirect();
        } catch (err) {
            console.error('Hosted UI login error', err);
            setError(t('errors.default'));
        }
    };

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
        <div className={cn("flex flex-col items-center justify-center bg-gray-100 p-4 pt-16 sm:pt-4", isAdmin && "bg-mist-900")}>
            <div className="w-full min-h-screen">
                {isLoggedIn && (
                    <div className="w-full pt-0 flex flex-wrap justify-between items-start gap-4">
                        {isAdmin && (
                            <div className="flex gap-2 flex-col items-start w-full sm:w-auto">
                                <Link href="/help/admin" className="w-full sm:w-auto">
                                    <Button
                                        variant="ghost"
                                        className="cursor-pointer text-white h-10 flex items-center gap-1.5 px-3 w-full sm:w-40 hover:text-white hover:bg-mist-700">
                                        <HelpCircle className="size-5" />
                                        <span className="text-xs font-bold">{t('helpAdminPage')}</span>
                                    </Button>
                                </Link>
                                <Link href="/admin" className="w-full sm:w-auto">
                                    <Button variant="destructive" className="shadow-md cursor-pointer border border-red-900 h-32 sm:h-40 w-full sm:w-40 flex flex-col items-center justify-center p-2 hover:bg-red-700 transition-colors">
                                        <Crown className="size-12 sm:size-18 drop-shadow-md stroke-[2]" />
                                        <div className='font-bold text-base sm:text-lg leading-tight text-center mt-1'>{t('qrAdminPage')}</div>
                                    </Button>
                                </Link>
                            </div>
                        )}
                        <div className="flex gap-2 flex-col items-start sm:items-end w-full sm:w-auto">
                            <Button
                                variant="ghost"
                                className="hover:bg-red-50 hover:text-red-600 cursor-pointer text-white w-full sm:w-40 justify-center h-10 "
                                onClick={async () => {
                                    await signOut();
                                    setIsLoggedIn(false);
                                    setIsAdmin(false);
                                }}
                            >
                                {t('logout')}
                            </Button>
                            {!singleShopOwner && (
                                <Link href="/shop" className="w-full sm:w-auto">
                                    <Button variant="secondary" className="shadow-md cursor-pointer border border-gray-200 flex flex-col items-center gap-2 font-bold h-32 sm:h-40 px-4 w-full sm:w-40">
                                        <Store className="size-12 sm:size-18 drop-shadow-md stroke-[1.5]" />
                                        <div className='font-bold text-base sm:text-lg leading-tight text-center mt-1'>{t('shopAdminPage')}</div>
                                    </Button>
                                </Link>
                            )}
                        </div>
                    </div>
                )}
                <div className="w-full flex-1 flex flex-col items-center justify-center min-h-[80vh] py-8 px-4">

                    <Card className="w-full max-w-2xl shadow-xl border-mist-700/50 bg-white/95 backdrop-blur-sm">
                        <CardHeader>
                            <CardTitle className="text-center text-2xl whitespace-pre-wrap break-all overflow-hidden">{isAdmin ? `Admin \n\n${userEmail}` : t('title')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-12 gap-4">
                                    <Loader2 className="w-10 h-10 animate-spin text-gray-400" />
                                    <p className="text-sm text-gray-500">Checking session...</p>
                                </div>
                            ) : isLoggedIn ? (
                                <div className="space-y-8 flex flex-col items-center py-6 animate-in fade-in zoom-in-95 duration-500">
                                    <h3 className="text-xl font-black text-gray-800 tracking-tight">{t('selectionTitle')}</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-lg">
                                        <Button 
                                            variant="default" 
                                            className="h-40 flex flex-col items-center justify-center gap-4 rounded-[2rem] text-xl font-black shadow-lg shadow-blue-500/20 bg-gradient-to-br from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 transition-all hover:scale-105 active:scale-95" 
                                            onClick={() => router.push('/shop')}
                                        >
                                            <div className="p-3 bg-white/20 rounded-2xl">
                                                <Store className="w-8 h-8 text-white" />
                                            </div>
                                            {t('shopAdminPage')}
                                        </Button>
                                        <Button 
                                            variant="outline" 
                                            className="h-40 flex flex-col items-center justify-center gap-4 border-2 border-blue-100 hover:border-blue-300 hover:bg-blue-50/50 rounded-[2rem] text-xl font-black text-blue-600 transition-all hover:scale-105 active:scale-95" 
                                            onClick={() => router.push(`/user/${userId}`)}
                                        >
                                            <div className="p-3 bg-blue-50 rounded-2xl">
                                                <User className="w-8 h-8 text-blue-600" />
                                            </div>
                                            {t('userProfilePage')}
                                        </Button>
                                    </div>
                                    
                                    {isAdmin && (
                                        <div className="pt-4 text-center">
                                            <p className="text-xs text-mist-500 font-bold uppercase tracking-widest mb-2">Administrators</p>
                                            <p className="text-sm text-gray-500 break-all px-4 bg-gray-50 py-2 rounded-xl">
                                                {userInfo}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : !isAdmin && (
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

                                    {!showMfa && (
                                        <>
                                            <div className="relative py-4">
                                                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                                    <div className="w-full border-t border-gray-200"></div>
                                                </div>
                                                <div className="relative flex justify-center text-sm">
                                                    <span className="px-2 bg-white text-gray-500">{t('or')}</span>
                                                </div>
                                            </div>

                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="w-full h-11 border-orange-500 text-orange-600 hover:bg-orange-50 font-bold flex items-center justify-center gap-2"
                                                onClick={handleHostedUILogin}
                                            >
                                                <HelpCircle className="size-5" />
                                                {t('signInWithAWS')}
                                            </Button>

                                            <div className="text-center pt-2">
                                                <button
                                                    type="button"
                                                    className="text-sm text-blue-600 hover:underline"
                                                    onClick={handleHostedUILogin}
                                                >
                                                    {t('forgotPassword')}
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </form>
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
            </div>
        </div >
    );
}
