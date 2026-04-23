/**
 * ファイル概要: ユーザー認証（ログイン）ページ
 * 
 * 役割:
 * Amazon Cognito (Amplify SDK) を利用したマルチ認証インターフェースを提供します。
 * ユーザーのアイデンティティを確認し、ロール（管理者・ショップオーナー・一般ユーザー）に基づく
 * 適切なページへの振り分けを担当します。
 * 
 * 仕様:
 * 1. 認証方式: 標準ID/パスワード、MFA（TOTP）、および Hosted UI (AWS 統合) をサポート。
 * 2. 自動ルーティング: 
 *    - 管理者グループ所属者: 管理者用ダッシュボードへのリンクを表示。
 *    - ショップオーナー: 複数ショップ所有時は選択肢を表示、単一所有時は自動遷移。
 *    - 一般ユーザー: ユーザーマイページ (`/user`) へ。
 * 3. ステータス管理: セッションの即時チェックを行い、有効な場合はログインフォームを省略。
 * 4. セキュリティ: 多要素認証 (MFA) のチャレンジ応答フローを完全に実装。
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
import { HelpCircle, Crown, Store, Loader2, User, LogOut } from 'lucide-react';

/**
 * ログインページコンポーネント
 * 認証状態、MFA、およびユーザー権限（管理者判定）を管理します。
 */
export default function LoginPage() {
    const t = useTranslations('LoginPage');
    const router = useRouter();

    /** 入力フィールド：メールアドレス */
    const [email, setEmail] = useState('');
    /** 入力フィールド：パスワード */
    const [password, setPassword] = useState('');
    /** 入力フィールド：MFAコード（TOTP等） */
    const [mfaCode, setMfaCode] = useState('');
    /** MFA入力画面の表示フラグ */
    const [showMfa, setShowMfa] = useState(false);
    /** エラーメッセージ表示 */
    const [error, setError] = useState('');
    /** 処理中フラグ（初期値 true でセッションチェックから開始） */
    const [loading, setLoading] = useState(true);
    /** ログイン済みフラグ */
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    /** ユーザーのメールアドレス（表示用） */
    const [userEmail, setUserEmail] = useState('');
    /** ユーザーID (Subject ID) */
    const [userId, setUserId] = useState('');
    /** 所属グループ情報（管理者向け） */
    const [userInfo, setUserInfo] = useState('');
    /** 所有ショップが1つのみかどうか（UI切り替え用） */
    const [singleShopOwner, setSingleShopOwner] = useState<boolean>(true);
    /** 管理者（Administratorsグループ所属）フラグ */
    const [isAdmin, setIsAdmin] = useState(false);

    /**
     * 現在の認証セッションを確認し、ログイン済みであれば権限情報を取得します。
     */
    const checkAuth = async () => {
        try {
            const session = await fetchAuthSession();
            if (session.tokens) {
                const payload = session.tokens.idToken?.payload || {};
                const groups = (payload['cognito:groups'] as string[]) || [];
                /** Administrators または GlobalAdmins グループ所属を確認 */
                const isAdmin = groups.includes('Administrators') || groups.includes('GlobalAdmins');
                const sub = payload['sub'] as string || "";

                setUserId(sub);
                setUserEmail(payload["email"] as string || "")
                setIsAdmin(isAdmin);
                if (isAdmin) {
                    setUserInfo(groups.join(" & "));
                }
                setIsLoggedIn(true);

                // 権限確認後、所有ショップなどの状況に応じてリダイレクト
                await redirectShopPage(sub);
            } else {
                handleHostedUILogin();
            }
        } catch (e) {
            handleHostedUILogin();
        }
    };

    /**
     * ログイン直後のリダイレクト先を判定します。
     * 一般ユーザーの場合、所有ショップの有無によって遷移先が変わります。
     */
    const redirectShopPage = async (sub: string) => {
        setLoading(true);
        try {
            // 管理者の場合は管理画面リンクを表示するため、リダイレクトせずに留まる
            if (isAdmin) {
                return;
            }
            // ショップリストを取得（まだ存在しないユーザーの場合は空リストが返る）
            const data = await shopApi.shop_list({ no_create: true });
            const shops = data.shops || [];

            if (shops.length === 0) {
                // ショップを持たない（または未登録の）ユーザーはプロフィールページへ
                router.push(`/user`);
            } else {
                // 1つ以上のショップがある場合は、ログイン後の選択肢を表示
                setSingleShopOwner(shops.length === 1);
            }
        } catch (e) {
            // 例外時は安全策としてプロフィールページへフォールバック
            router.push(`/user`);
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
            // aws-amplify の signInWithRedirect は options.lang を直接サポートしている。
            // queryParams は型定義に存在しないため使用不可。lang プロパティを直接渡す。
            await signInWithRedirect({
                options: {
                    lang: locale as string,
                }
            });
        } catch (err) {
            console.error('Hosted UI login error', err);
            setError(t('errors.default'));
        }
    };

    /**
     * Amplify SDK を利用したログイン処理を実行します。
     * ステータスに応じて MFA画面への切り替えや完了確認ページへの遷移を行います。
     */
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            if (showMfa) {
                // MFA (TOTP) コードの確認およびログイン完了
                const { isSignedIn } = await confirmSignIn({
                    challengeResponse: mfaCode
                });
                if (isSignedIn) {
                    await checkAuth();
                }
                return;
            }

            // 標準的な ID/PW 認証の試行
            const { isSignedIn, nextStep } = await signIn({ username: email, password });

            if (isSignedIn) {
                await checkAuth();
                return;
            } else {
                // 認証完了までに追加ステップ（メール確認・MFA等）が必要な場合
                if (nextStep.signInStep === 'CONFIRM_SIGN_UP') {
                    router.push(`/verify?username=${encodeURIComponent(email)}`);
                } else if (nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_TOTP_CODE') {
                    // MFA入力画面を表示
                    setShowMfa(true);
                } else {
                    setError(t('additionalStepRequired', { step: nextStep.signInStep }));
                }
            }
        } catch (err: any) {
            // エラーハンドリング：アカウント未確認やパスワード誤りなど
            if (err.name === 'NotAuthorizedException' || err.code === 'NotAuthorizedException') {
                setError(t('errors.notAuthorized'));
            } else if (err.name === 'UserNotConfirmedException' || err.code === 'UserNotConfirmedException') {
                setError(t('errors.notConfirmed'));
                router.push(`/verify?username=${encodeURIComponent(email)}`);
            } else if (err.name === 'CodeMismatchException') {
                setError(t('errors.invalidAuthCode'));
            } else {
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
                    <div className={cn("w-full pt-0 flex flex-wrap gap-4", (isAdmin ? "justify-between" : "justify-end"))}>
                        {isAdmin && (
                            <div className="flex gap-2 flex-col items-start w-auto">
                                <Link href="/help/admin" className="w-full">
                                    <Button
                                        variant="ghost"
                                        className="cursor-pointer text-white h-10 flex items-center gap-1.5 px-3 w-full hover:text-white hover:bg-mist-700">
                                        <HelpCircle className="size-5" />
                                        <span className="text-xs font-bold">{t('helpAdminPage')}</span>
                                    </Button>
                                </Link>
                                <Link href="/admin" className="w-full h-full">
                                    <Button variant="destructive" className="h-full p-7 pl-10 pr-10 shadow-md cursor-pointer border border-red-900 w-full flex flex-col items-center justify-center hover:bg-red-700 transition-colors rounded-[2rem]">
                                        <div className="p-3 bg-white/20 rounded-2xl">
                                            <Crown className="size-12 sm:size-18 drop-shadow-md stroke-[2]" />
                                        </div>
                                        <div className='font-bold text-base text-xl leading-tight text-center mt-3'>{t('qrAdminPage')}</div>
                                    </Button>
                                </Link>
                            </div>
                        )}
                        <div className="flex gap-2 flex-col items-start sm:items-end w-full sm:w-auto">
                            <Button
                                variant="ghost"
                                className={cn(
                                    "cursor-pointer w-full sm:w-40 justify-center h-10",
                                    isAdmin ? "text-white hover:bg-mist-700 hover:text-white" : "text-mist-500 hover:text-mist-800"
                                )}
                                onClick={async () => {
                                    await signOut();
                                    setIsLoggedIn(false);
                                    setIsAdmin(false);
                                    router.push(`/`);
                                }}
                            >
                                <LogOut className="w-5 h-5 mr-2" />
                                {t('logout')}
                            </Button>
                            {/* {!singleShopOwner && (
                                <Link href="/shop" className="w-full sm:w-auto">
                                    <Button variant="secondary" className="shadow-md cursor-pointer border border-gray-200 flex flex-col items-center gap-2 font-bold h-32 sm:h-40 px-4 w-full sm:w-40">
                                        <Store className="size-12 sm:size-18 drop-shadow-md stroke-[1.5]" />
                                        <div className='font-bold text-base sm:text-lg leading-tight text-center mt-1'>{t('shopAdminPage')}</div>
                                    </Button>
                                </Link>
                            )} */}
                        </div>
                    </div>
                )}
                <div className="w-full flex-1 flex flex-col items-center justify-center min-h-[80vh] py-8 px-4">

                    {loading ? (
                        <Card className="w-full max-w-2xl shadow-xl border-mist-700/50 bg-white/95 backdrop-blur-sm">
                            <CardContent>
                                <div className="flex flex-col items-center justify-center py-12 gap-4">
                                    <Loader2 className="w-10 h-10 animate-spin text-gray-400" />
                                    <p className="text-sm text-gray-500">{t('checkingSession')}</p>
                                </div>
                            </CardContent>
                        </Card>
                    ) : isLoggedIn ? (
                        <Card className="w-full max-w-2xl shadow-xl border-mist-700/50 bg-white/95 backdrop-blur-sm">
                            {/* <CardHeader>
                                <CardTitle className="text-xl font-black text-gray-800 tracking-tight text-center">{t('selectionTitle')}</CardTitle>
                            </CardHeader> */}
                            <CardContent>
                                <div className="space-y-8 flex flex-col items-center py-6 animate-in fade-in zoom-in-95 duration-500">
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
                                            onClick={() => router.push(`/user`)}
                                        >
                                            <div className="p-3 bg-blue-50 rounded-2xl">
                                                <User className="w-8 h-8 text-blue-600" />
                                            </div>
                                            {t('userProfilePage')}
                                        </Button>
                                    </div>
                                    <div className="text-center space-y-1">
                                        <p className="text-xs text-gray-400 font-medium">
                                            {t('userId')}: {userId}
                                        </p>
                                        {userEmail && (
                                            <p className="text-xs text-gray-400 font-medium">
                                                {t('email')}: {userEmail}
                                            </p>
                                        )}
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
                            </CardContent>
                        </Card>
                    ) : !isAdmin && (
                        <Card className="w-full max-w-2xl shadow-xl border-mist-700/50 bg-white/95 backdrop-blur-sm">
                            <CardHeader>
                                <CardTitle className="text-xl font-black text-gray-800 tracking-tight text-center">{t('selectionTitle')}</CardTitle>
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
                            </CardContent>
                        </Card>
                    )}
                    {/* <Card>
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
                    </Card> */}
                </div>
            </div>
        </div >
    );
}
