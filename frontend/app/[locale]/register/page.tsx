'use client';

import { useState } from 'react';
import { signUp } from 'aws-amplify/auth';
import { useRouter, Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
    const t = useTranslations('RegisterPage');
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

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
                    autoSignIn: true // Try to sign in immediately after confirmation
                }
            });

            console.log('Sign up result:', { isSignUpComplete, nextStep });

            if (isSignUpComplete) {
                setSuccess(true);
            } else if (nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
                router.push(`/verify?username=${encodeURIComponent(email)}`);
            }

        } catch (err: any) {
            if (err.name === 'UsernameExistsException' || err.code === 'UsernameExistsException') {
                // Determine if we should log this or not. For now, let's skip logging to avoid confusion.
                setError(t('errors.usernameExists'));
            } else {
                console.error('Register error', err);
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
