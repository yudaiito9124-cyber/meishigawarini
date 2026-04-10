/**
 * ファイル概要: ユーザー新規登録ページ
 * 
 * 役割:
 * 名刺代わりに。プラットフォームへの新規アカウント作成インターフェースを提供します。
 * Cognito (Amplify) を利用して、メールアドレスベースのユーザー登録を行います。
 * 
 * 登録フロー:
 * 1. サインアップ試行 (signUp)
 * 2. メールアドレス確認待ち (CONFIRM_SIGN_UP) へ遷移し、確認コード入力を促す。
 * 3. 完了後、ログインページへ誘導または自動サインイン。
 */
'use client';

import { useState } from 'react';
import { signUp } from 'aws-amplify/auth';
import { useRouter, Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

/**
 * 新規登録ページコンポーネント
 */
export default function RegisterPage() {
    /** 翻訳用フック */
    const t = useTranslations('RegisterPage');
    const router = useRouter();

    /** 入力値：メールアドレス */
    const [email, setEmail] = useState('');
    /** 入力値：パスワード */
    const [password, setPassword] = useState('');
    /** エラー表示用 */
    const [error, setError] = useState('');
    /** 登録処理中フラグ */
    const [loading, setLoading] = useState(false);
    /** 登録成功フラグ（UI切り替え用） */
    const [success, setSuccess] = useState(false);

    /**
     * サインアップ処理を実行します。
     */
    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const { isSignUpComplete, nextStep } = await signUp({
                username: email,
                password,
                options: {
                    userAttributes: {
                        email,
                    },
                    // 確認コード入力後の自動サインインを有効化
                    autoSignIn: true 
                }
            });

            if (isSignUpComplete) {
                // 通常はここで完了せず nextStep が CONFIRM_SIGN_UP になる
                setSuccess(true);
            } else if (nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
                // 確認コード入力ページへ、メールアドレスをパラメータとして保持して遷移
                router.push(`/verify?username=${encodeURIComponent(email)}`);
            }

        } catch (err: any) {
            // エラーハンドリング：既に登録されている場合など
            if (err.name === 'UsernameExistsException' || err.code === 'UsernameExistsException') {
                setError(t('errors.usernameExists'));
            } else {
                setError(err.message || t('errors.default'));
            }
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
                <Card className="w-full max-w-md text-center">
                    <CardHeader>
                        <CardTitle className="text-green-600">{t('successTitle')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p>{t('successMessage')}</p>
                        <Link href="/login">
                            <Button className="mt-4 w-full">{t('goToLogin')}</Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-center text-2xl">{t('title')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleRegister} className="space-y-4">
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
                            <p className="text-xs text-gray-500">{t('emailNote')}</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">{t('password')}</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={8}
                            />
                            <p className="text-xs text-gray-500">{t('passwordHint')}</p>
                        </div>
                        {error && <p className="text-sm text-red-500">{error}</p>}
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? t('creatingAccount') : t('signUp')}
                        </Button>
                    </form>
                </CardContent>
                <CardFooter className="justify-center">
                    <p className="text-sm text-gray-500">
                        {t('hasAccount')} <Link href="/login" className="text-blue-600 hover:underline">{t('loginLink')}</Link>
                    </p>
                </CardFooter>
            </Card>
        </div>
    );
}
