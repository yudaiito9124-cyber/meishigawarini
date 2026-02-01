"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// Verify PIN and Fetch Gift Details
const verifyGiftPin = async (uuid: string, pin: string) => {
    const res = await fetch(`${NEXT_PUBLIC_API_URL}/recipient/qrcodes/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid, pin }),
    });

    if (!res.ok) {
        if (res.status === 404 || res.status === 403) {
            throw new Error("Invalid PIN or Gift not found");
        }
        throw new Error("Failed to verify PIN");
    }
    return res.json();
};

// Submit Address
const submitAddress = async (uuid: string, pin: string, addressData: any) => {
    const res = await fetch(`${NEXT_PUBLIC_API_URL}/recipient/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            qr_id: uuid,
            pin_code: pin,
            shipping_info: addressData
        }),
    });

    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to submit address");
    }
    return res.json();
};

export default function ReceivePage() {
    const t = useTranslations('ReceivePage');
    const params = useParams();
    const uuid = params?.uuid as string;

    const [loading, setLoading] = useState(false);
    const [gift, setGift] = useState<any>(null);
    const [pin, setPin] = useState("");
    const [name, setName] = useState("");
    const [address, setAddress] = useState("");

    // Steps: PIN -> FORM (or SHIPPED/SUCCESS)
    const [step, setStep] = useState<"PIN" | "FORM" | "SUCCESS" | "SHIPPED">("PIN");

    const [error, setError] = useState<string | null>(null);
    const [pinError, setPinError] = useState("");

    const handleVerifyPin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setPinError("");
        setError(null);

        try {
            const data = await verifyGiftPin(uuid, pin);
            setGift(data);

            // Check status
            if (data.status === 'USED') {
                setStep("SUCCESS");
            } else if (data.status === 'SHIPPED') {
                setStep("SHIPPED");
            } else if (data.status === 'ACTIVE') {
                setStep("FORM");
            } else {
                // UNASSIGNED, BANNED, etc.
                setError(t('errors.inactive'));
            }

        } catch (err: any) {
            console.error(err);
            setPinError(err.message || t('errors.invalidPin'));
        } finally {
            setLoading(false);
        }
    };

    const handleAddressSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await submitAddress(uuid, pin, { name, address });
            setStep("SUCCESS");
        } catch (error: any) {
            console.error("Submission error:", error);
            alert(error.message || t('errors.submitFailed'));
        } finally {
            setLoading(false);
        }
    };

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <Card className="w-full max-w-md border-red-200">
                    <CardHeader className="bg-red-50">
                        <CardTitle className="text-red-800">Error</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                        <p className="text-red-600">{error}</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-xl text-center">
                        {step === "PIN" ? t('titles.pin') :
                            step === "FORM" ? t('titles.form') :
                                step === "SUCCESS" ? t('titles.success') :
                                    step === "SHIPPED" ? t('titles.shipped') : ""}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {/* Show Gift Info after PIN verification */}
                    {step !== "PIN" && gift && gift.product && (
                        <div className="mb-6 animate-in fade-in duration-500">
                            <img src={gift.product.image_url} alt="Gift" className="w-full h-48 object-cover rounded-md mb-4" />
                            <h2 className="font-bold text-lg">{gift.product.name}</h2>
                            <p className="text-gray-600 text-sm">{gift.product.description}</p>
                        </div>
                    )}

                    {step === "PIN" && (
                        <form onSubmit={handleVerifyPin} className="space-y-6">
                            <div className="space-y-2 p-4 bg-gray-50 rounded-lg">
                                <Label htmlFor="pin" className="font-semibold">{t('pinStep.label')}</Label>
                                <Input
                                    id="pin"
                                    type="text" // or password if preferred, but usually printed on card so text is fine
                                    placeholder={t('pinStep.placeholder')}
                                    value={pin}
                                    onChange={(e) => {
                                        setPin(e.target.value);
                                        setPinError("");
                                    }}
                                />
                                {pinError && <p className="text-sm text-red-500">{pinError}</p>}
                            </div>
                            <Button type="submit" className="w-full" disabled={loading || !pin}>
                                {loading ? t('pinStep.verifying') : t('pinStep.submit')}
                            </Button>
                        </form>
                    )}

                    {step === "FORM" && (
                        <form onSubmit={handleAddressSubmit} className="space-y-6">
                            <div className="space-y-4 pt-2 border-t">
                                <Label className="font-semibold">{t('formStep.title')}</Label>
                                <div className="space-y-2">
                                    <Label htmlFor="name">{t('formStep.name')}</Label>
                                    <Input
                                        id="name"
                                        required
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="address">{t('formStep.address')}</Label>
                                    <Input
                                        id="address"
                                        required
                                        value={address}
                                        onChange={(e) => setAddress(e.target.value)}
                                    />
                                </div>
                            </div>

                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading ? t('formStep.submitting') : t('formStep.submit')}
                            </Button>
                        </form>
                    )}

                    {step === "SUCCESS" && (
                        <div className="text-center py-6 space-y-4">
                            <p className="text-green-600 font-medium">{t('successStep.message')}</p>
                            <p className="text-sm text-gray-500">{t('successStep.subMessage')}</p>
                        </div>
                    )}

                    {step === "SHIPPED" && gift && (
                        <div className="text-center py-6 space-y-4">
                            <p className="text-green-600 font-medium">{t('shippedStep.message')}</p>
                            {/* Assuming gift object has shipping details if fetched */}
                            {gift.tracking_number && (
                                <p className="text-sm text-gray-500">{t('shippedStep.tracking', { number: gift.tracking_number })}</p>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
