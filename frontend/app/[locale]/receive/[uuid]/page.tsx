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

// Receive Gift
const receiveGift = async (uuid: string, pin: string) => {
    const res = await fetch(`${NEXT_PUBLIC_API_URL}/recipient/completed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            qr_id: uuid,
            pin_code: pin,
        }),
    });

    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to receive gift");
    }
    return res.json();
};

// Fetch Chat Messages
const fetchChatMessages = async (uuid: string, pin: string) => {
    const res = await fetch(`${NEXT_PUBLIC_API_URL}/recipient/qrcodes/${uuid}/chat?pin=${pin}`);
    if (!res.ok) throw new Error("Failed to fetch messages");
    return res.json();
};

// Post Chat Message
const postChatMessage = async (uuid: string, pin: string, username: string, message: string) => {
    const res = await fetch(`${NEXT_PUBLIC_API_URL}/recipient/qrcodes/${uuid}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, username, message }),
    });
    if (!res.ok) throw new Error("Failed to post message");
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
    const [zipCode, setZipCode] = useState("");
    const [address, setAddress] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");

    // Chat State
    const [messages, setMessages] = useState<any[]>([]);
    const [chatName, setChatName] = useState("");
    const [chatMessage, setChatMessage] = useState("");
    const [chatLoading, setChatLoading] = useState(false);

    // Steps: PIN -> FORM (or SHIPPED/SUCCESS)
    const [step, setStep] = useState<"PIN" | "FORM" | "SUCCESS" | "SHIPPED" | "EXPIRED" | "COMPLETED">("PIN");

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
            } else if (data.status === 'COMPLETED') {
                setStep("COMPLETED");
            } else if (data.status === 'SHIPPED') {
                setStep("SHIPPED");
            } else if (data.status === 'ACTIVE') {
                setStep("FORM");
            } else if (data.status === 'EXPIRED') {
                setStep("EXPIRED");
            } else {
                // UNASSIGNED, BANNED, etc.
                setError(t('errors.inactive'));
            }

        } catch (err: any) {
            console.error(err);
            setPinError(t('errors.invalidPin'));
        } finally {
            setLoading(false);
        }
    };

    const handleAddressSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await submitAddress(uuid, pin, { name, zipCode, address, phone, email });
            setStep("SUCCESS");
        } catch (error: any) {
            console.error("Submission error:", error);
            alert(error.message || t('errors.submitFailed'));
        } finally {
            setLoading(false);
        }
    };

    const handleReceive = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await receiveGift(uuid, pin);
            setStep("COMPLETED");
        } catch (error: any) {
            console.error("Receive error:", error);
            alert(error.message || t('errors.receiveFailed'));
        } finally {
            setLoading(false);
        }
    };

    // Load messages when step is not PIN (i.e. logged in)
    const loadMessages = async () => {
        try {
            const data = await fetchChatMessages(uuid, pin);
            setMessages(data.messages || []);
        } catch (e) {
            console.error(e);
        }
    };

    // Toggle chat loading state if needed, or just effect.
    // Effect to reload when step changes to something other than PIN
    const [hasLoadedChat, setHasLoadedChat] = useState(false);
    if (step !== "PIN" && !hasLoadedChat && pin) {
        setHasLoadedChat(true);
        loadMessages();
    }

    const handleChatSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatName || !chatMessage) return;
        setChatLoading(true);
        try {
            await postChatMessage(uuid, pin, chatName, chatMessage);
            setChatMessage(""); // Keep name
            await loadMessages();
        } catch (e) {
            alert("Failed to send message: " + e);
        } finally {
            setChatLoading(false);
        }
    };

    const getRemainingDays = (expiresAt: string) => {
        if (!expiresAt) return null;
        const diff = new Date(expiresAt).getTime() - new Date().getTime();
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
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
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-xl text-center">
                        {step === "PIN" ? t('titles.pin') :
                            step === "FORM" ? t('titles.form') :
                                step === "SUCCESS" ? t('titles.success') :
                                    step === "SHIPPED" ? t('titles.shipped') :
                                        step === "EXPIRED" ? t('titles.expired') : ""}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {/* Show Gift Info after PIN verification */}
                    {step !== "PIN" && gift && gift.product && (
                        <div className="mb-6 animate-in fade-in duration-500">
                            <img src={gift.product.image_url} alt="Gift" className="w-full h-48 object-cover rounded-md mb-4" />
                            <h2 className="font-bold text-lg">{gift.product.name}</h2>
                            <p className="text-gray-600 text-sm">{gift.product.description}</p>

                            {/* Remaining Days for Active Gift */}
                            {step === "FORM" && gift.expires_at && (
                                <p className="mt-2 text-sm font-semibold text-green-600 border border-green-200 bg-green-50 p-2 rounded text-center">
                                    {t('daysRemaining', { days: getRemainingDays(gift.expires_at) ?? 0 })}
                                </p>
                            )}

                            {/* Expired Message */}
                            {step === "EXPIRED" && (
                                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded text-center">
                                    <p className="text-red-600 font-bold">{t('expiredStep.message')}</p>
                                    <p className="text-red-500 text-sm mt-1">{t('expiredStep.subMessage', { date: new Date(gift.expires_at).toLocaleDateString() })}</p>
                                </div>
                            )}

                            {gift.memo_for_users && (
                                <div className="mt-4 p-3 bg-blue-50 rounded-md border border-blue-100">
                                    <h3 className="font-semibold text-sm text-blue-800 mb-1">{t('shopMessage')}</h3>
                                    <p className="text-sm text-blue-900 whitespace-pre-wrap">{gift.memo_for_users}</p>
                                </div>
                            )}
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
                                    <Label htmlFor="zipCode">{t('formStep.zipCode')}</Label>
                                    <Input
                                        id="zipCode"
                                        required
                                        value={zipCode}
                                        onChange={(e) => setZipCode(e.target.value)}
                                        placeholder="123-4567"
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
                                <div className="space-y-2">
                                    <Label htmlFor="phone">{t('formStep.phone')}</Label>
                                    <Input
                                        id="phone"
                                        type="tel"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        placeholder="090-1234-5678"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">{t('formStep.email')}</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="you@example.com"
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
                            <hr className="my-10 border-gray-200" />

                            <p className="text-gray-600 text-sm">{t('shippedStep.receivedMessage')}</p>
                            <Button type="submit" className="w-full" variant="outline" onClick={handleReceive} disabled={loading}>
                                {loading ? t('formStep.submitting') : t('shippedStep.receivedButton')}
                            </Button>

                        </div>
                    )}

                    {step === "COMPLETED" && gift && (
                        <div className="text-center py-6 space-y-4">
                            <p className="text-green-600 font-medium">{t('shippedStep.compleatedMessage')}</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Chat Section */}
            {step !== "PIN" && (
                <Card className="w-full max-w-md mt-6">
                    <CardHeader>
                        <CardTitle className="text-lg">{t('chat.title')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="max-h-60 overflow-y-auto space-y-3 p-2 border rounded bg-gray-50">
                                {messages.length === 0 ? (
                                    <p className="text-sm text-gray-500 text-center py-4">{t('chat.noMessages')}</p>
                                ) : (
                                    messages.slice().reverse().map((msg) => (
                                        <div key={msg.id} className="bg-white p-2 rounded shadow-sm text-sm">
                                            <p className="font-bold text-xs text-gray-600 mb-1">{msg.username} <span className="text-gray-400 font-normal">• {new Date(msg.created_at).toLocaleString()}</span></p>
                                            <p className="whitespace-pre-wrap">{msg.message}</p>
                                        </div>
                                    ))
                                )}
                            </div>

                            <form onSubmit={handleChatSubmit} className="space-y-3 border-t pt-4">
                                <div>
                                    <Label htmlFor="chatName" className="text-xs">{t('chat.name')}</Label>
                                    <Input
                                        id="chatName"
                                        placeholder={t('chat.namePlaceholder')}
                                        value={chatName}
                                        onChange={(e) => setChatName(e.target.value)}
                                        required
                                        className="h-8"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="chatMessage" className="text-xs">{t('chat.message')}</Label>
                                    <Input
                                        id="chatMessage"
                                        placeholder={t('chat.placeholder')}
                                        value={chatMessage}
                                        onChange={(e) => setChatMessage(e.target.value)}
                                        required
                                    />
                                </div>
                                <Button type="submit" size="sm" className="w-full" disabled={chatLoading}>
                                    {chatLoading ? t('chat.submitting') : t('chat.submit')}
                                </Button>
                            </form>
                        </div>
                    </CardContent>
                </Card>
            )}

        </div>
    );
}
