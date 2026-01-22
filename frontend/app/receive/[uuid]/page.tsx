
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
    const [step, setStep] = useState<"PIN" | "FORM" | "SUCCESS">("PIN");

    useEffect(() => {
        if (uuid) {
            fetchGiftDetails(uuid).then(data => {
                setGift(data);
                setLoading(false);
            });
        }
    }, [uuid]);

    const handlePinSubmit = () => {
        // In real app, verify PIN with API here or just move to FORM
        if (pin.length >= 4) {
            setStep("FORM");
        } else {
            alert("Please enter a valid PIN");
        }
    };

    const handleAddressSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        await submitAddress(uuid, pin, { name, address });
        setLoading(false);
        setStep("SUCCESS");
    };

    if (loading) return <div className="p-8 text-center">Loading gift details...</div>;
    if (!gift) return <div className="p-8 text-center">Gift not found</div>;

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-xl text-center">
                        {step === "SUCCESS" ? "Thank You!" : "You received a gift!"}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {step !== "SUCCESS" && (
                        <div className="mb-6">
                            <img src={gift.product.image_url} alt="Gift" className="w-full h-48 object-cover rounded-md mb-4" />
                            <h2 className="font-bold text-lg">{gift.product.name}</h2>
                            <p className="text-gray-600 text-sm">{gift.product.description}</p>
                        </div>
                    )}

                    {step === "PIN" && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="pin">Enter PIN Code</Label>
                                <Input
                                    id="pin"
                                    type="text"
                                    placeholder="Check your card for the PIN"
                                    value={pin}
                                    onChange={(e) => setPin(e.target.value)}
                                />
                            </div>
                            <Button className="w-full" onClick={handlePinSubmit}>Verify PIN</Button>
                        </div>
                    )}

                    {step === "FORM" && (
                        <form onSubmit={handleAddressSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Full Name</Label>
                                <Input
                                    id="name"
                                    required
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="address">Delivery Address</Label>
                                <Input
                                    id="address"
                                    required
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value)}
                                />
                            </div>
                            <Button type="submit" className="w-full" disabled={loading}>
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
                </CardContent>
            </Card>
        </div>
    );
}
