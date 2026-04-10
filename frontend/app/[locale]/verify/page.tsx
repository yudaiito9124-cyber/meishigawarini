/**
 * ファイル概要: アカウント確認(検証)ページ
 * 
 * 役割:
 * 新規登録（サインアップ）後、ユーザーのメールアドレスに送信された確認コードを入力し、
 * Cognito上のユーザーを「CONFIRMED」ステータスに移行させるためのインターフェースです。
 * 
 * 構成:
 * - VerifyContent: クエリパラメータ (username) の取得と認証処理の本体。
 * - VerifyPage: useSearchParams 等のフックを利用するため Suspense でラップした公開コンポーネント。
 */
'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { confirmSignUp } from 'aws-amplify/auth';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useTranslations } from 'next-intl';

/**
 * 検証フォーム本体
 */
function VerifyContent() {
    /** 翻訳用フック */
    const t = useTranslations('VerifyPage');
    const router = useRouter();
    const searchParams = useSearchParams();
    
    /** URLパラメータから初期ユーザー名（メール）を取得 */
    const initialUsername = searchParams.get('username') || '';

    /** 入力値：ユーザー名 */
    const [username, setUsername] = useState(initialUsername);
    /** 入力値：確認コード */
    const [code, setCode] = useState('');
    /** エラー表示用 */
    const [error, setError] = useState('');
    /** 処理中フラグ */
    const [loading, setLoading] = useState(false);

    /**
     * アカウントの確認処理を実行します。
     */
    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const { isSignUpComplete, nextStep } = await confirmSignUp({
                username,
                confirmationCode: code
            });

            if (isSignUpComplete) {
                router.push('/login');
            } else {
                setError(t('errors.incomplete', { step: nextStep.signUpStep }));
            }

        } catch (err: any) {
            // console.error('Verification error', err);
            setError(err.message || t('errors.failed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>{t('title')}</CardTitle>
                    <CardDescription>{t('description')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleVerify} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="username">{t('email')}</Label>
                            <Input
                                id="username"
                                type="email"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                                placeholder={t('emailPlaceholder')}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="code">{t('code')}</Label>
                            <Input
                                id="code"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                required
                                placeholder={t('codePlaceholder')}
                            />
                        </div>
                        {error && <p className="text-sm text-red-500">{error}</p>}
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? t('verifying') : t('button')}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

/**
 * アカウント確認ページ
 * Next.js の仕様により、useSearchParams を使用するコンポーネントは
 * Suspense境界内に配置する必要があります。
 */
export default function VerifyPage() {
    const t = useTranslations('VerifyPage');
    return (
        <Suspense fallback={<div>{t('loading')}</div>}>
            <VerifyContent />
        </Suspense>
    );
}
