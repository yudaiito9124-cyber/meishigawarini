
"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// Fetch Gift Details
const fetchGiftDetails = async (uuid: string) => {
    const res = await fetch(`${API_URL}/recipient/qrcodes/${uuid}`, {
        method: "GET",
    });

    if (!res.ok) {
        throw new Error("Failed to fetch gift details");
    }
    return res.json();
};

// Submit Address
const submitAddress = async (uuid: string, pin: string, addressData: any) => {
    const res = await fetch(`${API_URL}/recipient/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            qr_id: uuid,
            pin_code: pin,
            shipping_info: addressData
        }),
    });

    if (!res.ok) {
        // Handle error response (e.g., invalid PIN)
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to submit address");
    }
    return res.json();
};

export default function ReceivePage() {
    const params = useParams();
    const uuid = params?.uuid as string;

    const [loading, setLoading] = useState(true);
    const [gift, setGift] = useState<any>(null);
    const [pin, setPin] = useState("");
    const [name, setName] = useState("");
    const [address, setAddress] = useState("");
    const [step, setStep] = useState<"PIN" | "FORM" | "SUCCESS" | "SHIPPED">("PIN");

    const [error, setError] = useState<string | null>(null);
    const [pinVerified, setPinVerified] = useState(false);
    const [pinError, setPinError] = useState("");

    useEffect(() => {
        if (uuid) {
            setLoading(true);
            fetchGiftDetails(uuid)
                .then(data => {
                    setGift(data);

                    // Check status
                    if (data.status !== 'ACTIVE' && data.status !== 'USED' && data.status !== 'SHIPPED') {
                        setError("This card has not been activated yet. Please contact the shop or the person who gave you this gift.");
                    } else if (data.status === 'USED') {
                        setStep("SUCCESS");
                    }

                    setLoading(false);
                })
                .catch(err => {
                    console.error(err);
                    setError("Failed to load gift details.");
                    setLoading(false);
                });
        }
    }, [uuid]);

    const verifyPin = () => {
        if (!gift) return;
        if (pin === gift.pin) {
            setPinVerified(true);
            setPinError("");
            alert("PIN Verified!");

            if (gift.status === 'ACTIVE') {
                setStep("FORM");
            } else if (gift.status === 'SHIPPED') {
                setStep("SHIPPED");
            }

        } else {
            setPinVerified(false);
            setPinError("Incorrect PIN");
        }
    };

    const handleAddressSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!pinVerified) {
            // Verify again just in case
            if (pin === gift.pin) {
                setPinVerified(true);
                setStep("FORM");
            } else {
                setPinError("Please verify your PIN code first.");
                return;
            }
        }

        setLoading(true);
        try {
            await submitAddress(uuid, pin, { name, address });
            setStep("SUCCESS");
        } catch (error: any) {
            console.error("Submission error:", error);
            alert(error.message || "Failed to submit address. Please check your PIN and try again.");
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-8 text-center">Loading gift details...</div>;

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <Card className="w-full max-w-md border-red-200">
                    <CardHeader className="bg-red-50">
                        <CardTitle className="text-red-800">Error</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                        <p className="text-red-600">{error}</p>
                        <div className="mt-4 text-sm text-gray-500">
                            Gift ID: {uuid}
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!gift) return <div className="p-8 text-center">Gift not found</div>;

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-xl text-center">
                        {step === "PIN" ? "Enter PIN to View Gift" : step === "FORM" ? "You received a gift!" : step === "SUCCESS" ? "Thank You!" : step === "SHIPPED" ? "Your gift is on the way!" : "UNDEFINED"}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {step !== "PIN" && pinVerified && (
                        <div className="mb-6 animate-in fade-in duration-500">
                            <img src={gift.product.image_url} alt="Gift" className="w-full h-48 object-cover rounded-md mb-4" />
                            <h2 className="font-bold text-lg">{gift.product.name}</h2>
                            <p className="text-gray-600 text-sm">{gift.product.description}</p>
                        </div>
                    )}

                    {step === "PIN" && (
                        <form onSubmit={handleAddressSubmit} className="space-y-6">
                            <div className="space-y-2 p-4 bg-gray-50 rounded-lg">
                                <Label htmlFor="pin" className="font-semibold">1. Enter PIN Code</Label>
                                <div className="flex space-x-2">
                                    <Input
                                        id="pin"
                                        type="text"
                                        placeholder="Check your card"
                                        value={pin}
                                        onChange={(e) => {
                                            setPin(e.target.value);
                                            setPinVerified(false);
                                            setPinError("");
                                        }}
                                        className={pinVerified ? "border-green-500 bg-green-50" : ""}
                                    />
                                    <Button type="button" variant="outline" onClick={verifyPin}>
                                        Verify
                                    </Button>
                                </div>
                                {pinError && <p className="text-sm text-red-500">{pinError}</p>}
                            </div>
                        </form>
                    )}
                    {step === "FORM" && (
                        <form onSubmit={handleAddressSubmit} className="space-y-6">
                            <div className="space-y-4 pt-2 border-t">
                                <Label className="font-semibold">2. Delivery Details</Label>
                                <div className="space-y-2">
                                    <Label htmlFor="name">Full Name</Label>
                                    <Input
                                        id="name"
                                        required
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        disabled={!pinVerified}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="address">Delivery Address</Label>
                                    <Input
                                        id="address"
                                        required
                                        value={address}
                                        onChange={(e) => setAddress(e.target.value)}
                                        disabled={!pinVerified}
                                    />
                                </div>
                            </div>

                            <Button type="submit" className="w-full" disabled={loading || !pinVerified}>
                                {loading ? "Submitting..." : "Receive Gift"}
                            </Button>
                        </form>
                    )}

                    {step === "SUCCESS" && (
                        <div className="text-center py-6 space-y-4">
                            <p className="text-green-600 font-medium">Your shipping information has been sent!</p>
                            <p className="text-sm text-gray-500">The shop will ship your gift soon.</p>
                        </div>
                    )}
                    {step === "SHIPPED" && (
                        <div className="text-center py-6 space-y-4">
                            <p className="text-green-600 font-medium">Your gift has been shipped!</p>
                            <p className="text-sm text-gray-500">{gift.shipping_info}</p>
                            <p className="text-sm text-gray-500">{gift.tracking_number}</p>
                            <p className="text-sm text-gray-500">{gift.shipped_at}</p>

                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
