'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { confirmSignUp } from 'aws-amplify/auth';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useTranslations } from 'next-intl';

function VerifyContent() {
    const t = useTranslations('VerifyPage');
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialUsername = searchParams.get('username') || '';

    const [username, setUsername] = useState(initialUsername);
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

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
            console.error('Verification error', err);
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

export default function VerifyPage() {
    const t = useTranslations('VerifyPage');
    return (
        <Suspense fallback={<div>{t('loading')}</div>}>
            <VerifyContent />
        </Suspense>
    );
}
