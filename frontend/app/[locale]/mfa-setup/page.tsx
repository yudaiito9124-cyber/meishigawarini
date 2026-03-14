'use client';

import { useState, useEffect } from 'react';
import { setUpTOTP, verifyTOTPSetup, updateMFAPreference, fetchAuthSession, signOut } from 'aws-amplify/auth';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import QRCode from 'qrcode';
import { CheckCircle2, AlertCircle, Fingerprint } from "lucide-react";

export default function MFASetupPage() {
    const t = useTranslations('MFASetupPage');
    const router = useRouter();
    const [qrCodeUrl, setQrCodeUrl] = useState('');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [passkeySuccess, setPasskeySuccess] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);

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
                console.error('Auth check failed', e);
                setError('errors.notLoggedIn');
            }
        };
        checkAuth();
    }, []);

    const initiateMFASetup = async () => {
        try {
            setLoading(true);
            const totpSetupDetails = await setUpTOTP();
            const appName = "Meishigawarini";
            const setupUri = totpSetupDetails.getSetupUri(appName);
            const dataUrl = await QRCode.toDataURL(setupUri.toString());
            setQrCodeUrl(dataUrl);
        } catch (err: any) {
            console.error('MFA Setup initiation failed', err);
            setError('errors.setupFailed');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyToken = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await verifyTOTPSetup({ code });
            await updateMFAPreference({ totp: 'PREFERRED' });
            setSuccess(true);
        } catch (err: any) {
            console.error('Verification failed', err);
            setError(err.message || 'errors.verifyFailed');
        } finally {
            setLoading(false);
        }
    };

    const handlePasskeySetup = async () => {
        setLoading(true);
        setError('');
        try {
            // パスキーを作成 (顔認証・指紋認証ダイアログが表示される)
            const { associateWebAuthnCredential } = await import('aws-amplify/auth');
            if (typeof associateWebAuthnCredential === 'function') {
                await associateWebAuthnCredential();
                setPasskeySuccess(true);
            } else {
                throw new Error("associateWebAuthnCredential function not found in aws-amplify/auth");
            }
        } catch (err: any) {
            console.error('Passkey registration failed', err);
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
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-center text-2xl font-bold">{t('title')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-8">
                    {/* 方法1: 認証アプリ */}
                    <div className="space-y-4 bg-gray-50 p-4 rounded-xl">
                        <Label className="text-base font-bold">{t('totpLabel')}</Label>
                        <div className="flex justify-center p-2 bg-white border rounded">
                            {qrCodeUrl ? <img src={qrCodeUrl} alt="QR Code" className="w-40 h-40" /> : <div className="h-40 flex items-center">Loading...</div>}
                        </div>
                        <form onSubmit={handleVerifyToken} className="space-y-2">
                            <Input
                                type="text"
                                placeholder={t('totpPlaceholder')}
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                className="text-center text-2xl tracking-[0.3em] font-mono h-12"
                                maxLength={6}
                                required
                            />
                            <Button type="submit" className="w-full" disabled={loading}>{t('totpSubmit')}</Button>
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
    );
}
