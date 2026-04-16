/**
 * ファイル概要: MFA (多要素認証) 設定ページ
 * 
 * 役割:
 * 管理者ユーザーが、認証アプリ（Google Authenticator, iOS Passwords等）を使用して
 * ログイン時の二段階認証を設定するためのインターフェースです。
 * TOTP（Time-based One-Time Password）のシークレットキー生成およびQRコード表示を行います。
 */
'use client';

import { useState, useEffect, useRef } from 'react';
import { setUpTOTP, verifyTOTPSetup, updateMFAPreference, fetchAuthSession, signOut, getCurrentUser } from 'aws-amplify/auth';
import { Link, useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import QRCode from 'qrcode';
import { CheckCircle2, AlertCircle, Fingerprint, HelpCircle } from "lucide-react";

/**
 * MFA設定ページコンポーネント
 */
export default function MFASetupPage() {
    /** 翻訳用フック */
    const t = useTranslations('MFASetupPage');
    const router = useRouter();

    /** QRコードの画像URL (Data URL) */
    const [qrCodeUrl, setQrCodeUrl] = useState('');
    /** 入力値：確認用の6桁コード */
    const [code, setCode] = useState('');
    /** 処理中フラグ */
    const [loading, setLoading] = useState(false);
    /** エラー表示用 */
    const [error, setError] = useState('');
    /** TOTP設定成功フラグ */
    const [success, setSuccess] = useState(false);
    /** パスキー設定成功フラグ */
    const [passkeySuccess, setPasskeySuccess] = useState(false);
    /** ログイン済みフラグ */
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    /** 二重初期化防止用の参照 */
    const isInitiating = useRef(false);

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const session = await fetchAuthSession();
                if (!session.tokens) {
                    setError('errors.notLoggedIn');
                    return;
                }
                setIsLoggedIn(true);
                initiateMFASetup();
            } catch (e) {
                // console.error('Auth check failed', e);
                setError('errors.notLoggedIn');
            }
        };
        checkAuth();
    }, []);

    /**
     * MFAのセットアッププロセスを初期化します。
     * Cognitoからシークレットキーを生成し、認証アプリ登録用のURIを作成します。
     */
    const initiateMFASetup = async () => {
        if (isInitiating.current) return;
        isInitiating.current = true;

        try {
            setLoading(true);
            // ユーザー情報と属性（メール等）を並行取得
            const [{ username }, attributes] = await Promise.all([
                getCurrentUser(),
                import('aws-amplify/auth').then(m => m.fetchUserAttributes())
            ]);

            // TOTP設定の開始（シークレットキーの取得）
            const totpSetupDetails = await setUpTOTP();
            const appName = "Meishigawarini";
            const accountName = attributes.email || username;

            /**
             * iOS Passwords や Google Authenticator で正しく認識されるためのURI構築
             * label: 'Issuer:Account' 形式
             */
            const label = `${appName}:${accountName}`;
            const setupUri = `otpauth://totp/${label}?secret=${totpSetupDetails.sharedSecret}&issuer=${encodeURIComponent(appName)}`;

            // URIをQRコード画像として生成
            const dataUrl = await QRCode.toDataURL(setupUri, {
                errorCorrectionLevel: 'H',
                margin: 2,
                width: 250
            });
            setQrCodeUrl(dataUrl);
        } catch (err: any) {
            console.error(err)
            setError('errors.setupFailed');
        } finally {
            setLoading(false);
        }
    };

    /**
     * 入力されたコードを検証し、MFAを「優先（PREFERRED）」に設定します。
     */
    const handleVerifyToken = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // 入力コードの検証
            await verifyTOTPSetup({ code });
            // 以降のログインでMFAを必須化
            await updateMFAPreference({ totp: 'PREFERRED' });
            setSuccess(true);
        } catch (err: any) {
            setError(err.message || 'errors.verifyFailed');
        } finally {
            setLoading(false);
        }
    };

    /**
     * パスキー（WebAuthn）等の生体認証設定を試行します。
     */
    const handlePasskeySetup = async () => {
        setLoading(true);
        setError('');
        try {
            // パスキーを作成 (顔認証・指紋認証などのネイティブダイアログが表示される)
            const { associateWebAuthnCredential } = await import('aws-amplify/auth');
            if (typeof associateWebAuthnCredential === 'function') {
                await associateWebAuthnCredential();
                setPasskeySuccess(true);
            } else {
                throw new Error("associateWebAuthnCredential function not found in aws-amplify/auth");
            }
        } catch (err: any) {
            setError('errors.biometricFailed');
        } finally {
            setLoading(false);
        }
    };

    const handleDone = async () => {
        await signOut();
        router.push('/login');
    };

    if (error === 'errors.notLoggedIn') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
                <Card className="w-full max-w-md">
                    <CardHeader><CardTitle className="text-red-600 font-bold">{t('authError')}</CardTitle></CardHeader>
                    <CardContent><p>{t('errors.notLoggedIn')}</p></CardContent>
                    <CardFooter><Button onClick={() => router.push('/login')} className="w-full">{t('backToLogin')}</Button></CardFooter>
                </Card>
            </div>
        );
    }

    if (success || passkeySuccess) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
                <Card className="w-full max-w-md">
                    <CardHeader><CardTitle className="text-center text-2xl font-bold">{t('doneTitle')}</CardTitle></CardHeader>
                    <CardContent className="space-y-4 text-center">
                        <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
                        <h3 className="text-lg font-bold">{success ? t('appSetupDone') : t('biometricSetupDone')}</h3>
                        <p className="text-sm text-gray-600">
                            {success ? t('appNextTime') : t('biometricNextTime')}
                        </p>
                        <Button onClick={handleDone} className="w-full bg-green-600 hover:bg-green-700 font-bold mt-4">{t('backToLogin')}</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-gray-100 p-4 flex-col">
            <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
                <Card className="w-full max-w-md relative">
                    <CardHeader>
                        <div className="absolute -top-5 -right-6 z-10">
                            <Link href="/help/admin">
                                <Button variant="secondary" className="flex flex-wrap justify-end shadow-md cursor-pointer border border-gray-200 rotate-12 transition-transform hover:scale-105 active:scale-95">
                                    <HelpCircle className="w-4 h-4 mr-1" /> {t('helpAdminPage')}
                                </Button>
                            </Link>
                        </div>
                        <CardTitle className="text-center text-2xl font-bold">{t('title')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-8">
                        {/* 方法1: 認証アプリ */}
                        <div className="space-y-4 bg-gray-50 p-4 rounded-xl">
                            <Label className="text-base font-bold">{t('step1')}</Label>
                            <div className="flex justify-center p-2 bg-white border rounded">
                                {qrCodeUrl ? <img src={qrCodeUrl} alt="QR Code" className="w-40 h-40" /> : <div className="h-40 flex items-center">Loading...</div>}
                            </div>
                            <Label className="text-base font-bold">{t('step2')}</Label>
                            <form onSubmit={handleVerifyToken} className="space-y-4">
                                <div className="space-y-2">
                                    <Input
                                        type="text"
                                        placeholder="000000"
                                        value={code}
                                        onChange={(e) => setCode(e.target.value)}
                                        className="text-center text-2xl tracking-[0.3em] font-mono h-12"
                                        maxLength={6}
                                        required
                                    />
                                </div>
                                <Button type="submit" className="w-full font-bold" disabled={loading}>{t('totpSubmit')}</Button>
                            </form>
                        </div>

                        {/* 生体認証は一旦コメントアウト
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center"><span className="w-full border-t"></span></div>
                        <div className="relative flex justify-center text-xs"><span className="px-2 bg-gray-100 text-gray-500 uppercase">OR</span></div>
                    </div>

                    <div className="space-y-4">
                        <Label className="text-base font-bold flex items-center gap-2">
                             <Fingerprint className="h-5 w-5 text-blue-600" />
                             2. 生体認証 (パスキー)
                        </Label>
                        <p className="text-xs text-gray-500">このデバイス（iPhoneのFaceIDやPCのTouchIDなど）を登録します。</p>
                        <Button 
                            type="button" 
                            variant="outline" 
                            onClick={handlePasskeySetup} 
                            className="w-full border-blue-600 text-blue-600 hover:bg-blue-50 font-bold py-6"
                            disabled={loading}
                        >
                            生体認証を登録する
                        </Button>
                    </div>
                    */}

                        {error && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-xs flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                {error.startsWith('errors.') ? t(error) : error}
                            </div>
                        )}
                    </CardContent>
                    <CardFooter>
                        <Button variant="ghost" onClick={() => router.back()} className="w-full text-gray-400">{t('back')}</Button>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
}
