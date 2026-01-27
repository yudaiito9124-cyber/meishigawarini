'use client';

import { useState, useEffect } from 'react';
import { signIn, getCurrentUser } from 'aws-amplify/auth';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import Link from 'next/link';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const checkAuth = async () => {
            try {
                await getCurrentUser();
                router.replace('/shop');
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
            const { isSignedIn, nextStep } = await signIn({ username: email, password });

            if (isSignedIn) {
                router.push('/shop');
            } else {
                if (nextStep.signInStep === 'CONFIRM_SIGN_UP') {
                    router.push(`/verify?username=${encodeURIComponent(email)}`);
                } else {
                    setError(`Additional step required: ${nextStep.signInStep}`);
                }
            }
        } catch (err: any) {
            if (err.name === 'NotAuthorizedException' || err.code === 'NotAuthorizedException') {
                setError('Incorrect username or password.');
            } else if (err.name === 'UserNotConfirmedException' || err.code === 'UserNotConfirmedException') {
                // Handle unconfirmed user
                setError('User is not confirmed. Please verify your email.');
                router.push(`/verify?username=${encodeURIComponent(email)}`);
            } else {
                console.error('Login error', err);
                setError(err.message || 'Failed to login');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-center text-2xl">Sign In</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
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
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                        {error && <p className="text-sm text-red-500">{error}</p>}
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? 'Signing in...' : 'Sign In'}
                        </Button>
                    </form>
                </CardContent>
                <CardFooter className="justify-center">
                    <p className="text-sm text-gray-500">
                        Don't have an account? <Link href="/register" className="text-blue-600 hover:underline">Sign up</Link>
                    </p>
                </CardFooter>
            </Card>
        </div>
    );
}
