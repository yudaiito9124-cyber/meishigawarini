'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export default function RecipientPage() {
    const params = useParams();
    // Ensure id is a string
    const id = Array.isArray(params.id) ? params.id[0] : params.id;

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [step, setStep] = useState<'PIN' | 'FORM' | 'SUCCESS' | 'USED' | 'SHIPPED'>('PIN');

    // Data
    const [qrData, setQrData] = useState<any>(null);

    // Form States
    const [pin, setPin] = useState('');
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        postal_code: '',
        address: ''
    });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!id) return;
        fetchQrDetails();
    }, [id]);

    const fetchQrDetails = async () => {
        try {
            const res = await fetch(`${API_URL}/recipient/qrcodes/${id}`);
            if (!res.ok) {
                if (res.status === 404) throw new Error('Gift not found');
                throw new Error('Failed to load gift details');
            }
            const data = await res.json();
            setQrData(data);

            if (data.status === 'USED') {
                setStep('USED');
            } else if (data.status === 'SHIPPED') {
                setStep('SHIPPED');
            } else if (data.status === 'ACTIVE') {
                setStep('PIN');
            } else {
                setError('Invalid status');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handlePinSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!qrData) return;

        if (pin === qrData.pin) {
            setStep('FORM');
            setError('');
        } else {
            setError('Incorrect PIN code');
        }
    };

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');

        try {
            const res = await fetch(`${API_URL}/recipient/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    qr_id: id,
                    pin_code: pin, // Send PIN again for server verification
                    shipping_info: formData
                })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.message || 'Submission failed');
            }

            setStep('SUCCESS');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
    }

    if (error && !qrData) {
        return <div className="min-h-screen flex items-center justify-center text-red-500">{error}</div>;
    }

    const renderProductPreview = () => (
        <Card className="mb-6">
            <CardHeader>
                <CardTitle>{qrData?.product?.name}</CardTitle>
                <CardDescription>{qrData?.product?.description}</CardDescription>
            </CardHeader>
            {qrData?.product?.image_url && (
                <CardContent>
                    {/* Using img tag for simplicity with external URLs, in generic implementation */}
                    <img
                        src={qrData.product.image_url}
                        alt={qrData.product.name}
                        className="w-full h-48 object-cover rounded-md"
                    />
                </CardContent>
            )}
        </Card>
    );

    return (
        <div className="min-h-screen bg-gray-50 p-4 flex flex-col items-center">
            <div className="w-full max-w-md">

                {/* Header / Brand could go here */}

                {step === 'PIN' && qrData && (
                    <>
                        <h1 className="text-2xl font-bold text-center mb-6">You've received a gift!</h1>
                        <Card>
                            <CardHeader>
                                <CardTitle>Enter PIN Code</CardTitle>
                                <CardDescription>Please enter the PIN code found on your card to claim your gift.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handlePinSubmit} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="pin">PIN Code</Label>
                                        <Input
                                            id="pin"
                                            type="text"
                                            placeholder="e.g. 1234"
                                            value={pin}
                                            onChange={(e) => setPin(e.target.value)}
                                            required
                                        />
                                    </div>
                                    {error && <p className="text-red-500 text-sm">{error}</p>}
                                    <Button type="submit" className="w-full">Verify PIN</Button>
                                </form>
                            </CardContent>
                        </Card>
                    </>
                )}

                {step === 'FORM' && (
                    <>
                        {renderProductPreview()}
                        <Card>
                            <CardHeader>
                                <CardTitle>Shipping Details</CardTitle>
                                <CardDescription>Where should we send your gift?</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleFormSubmit} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="name">Full Name</Label>
                                        <Input
                                            id="name"
                                            value={formData.name}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="phone">Phone Number</Label>
                                        <Input
                                            id="phone"
                                            type="tel"
                                            value={formData.phone}
                                            onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="postal">Postal Code</Label>
                                        <Input
                                            id="postal"
                                            value={formData.postal_code}
                                            onChange={e => setFormData({ ...formData, postal_code: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="address">Address</Label>
                                        <Input
                                            id="address"
                                            value={formData.address}
                                            onChange={e => setFormData({ ...formData, address: e.target.value })}
                                            required
                                        />
                                    </div>

                                    {error && <p className="text-red-500 text-sm">{error}</p>}
                                    <Button type="submit" className="w-full" disabled={submitting}>
                                        {submitting ? 'Submitting...' : 'Claim Gift'}
                                    </Button>
                                </form>
                            </CardContent>
                        </Card>
                    </>
                )}

                {step === 'SUCCESS' && (
                    <Card className="text-center">
                        <CardHeader>
                            <CardTitle className="text-green-600">Successfully Claimed!</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p>Thank you! Your gift is on its way.</p>
                            <p className="mt-4 text-sm text-gray-500">You can close this window now.</p>
                        </CardContent>
                    </Card>
                )}

                {step === 'USED' && (
                    <Card className="text-center">
                        <CardHeader>
                            <CardTitle className="text-yellow-600">Already Claimed</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p>This gift has already been claimed.</p>
                        </CardContent>
                    </Card>
                )}

                {step === 'SHIPPED' && (
                    <Card className="text-center">
                        <CardHeader>
                            <CardTitle className="text-blue-600">Shipped</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p>This gift has been picked up properly!</p>
                        </CardContent>
                    </Card>
                )}

            </div>
        </div>
    );
}
