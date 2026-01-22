
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

// Mock Products
const PRODUCTS = [
    { id: "prod-1", name: "Premium Sake Set" },
    { id: "prod-2", name: "Matcha Cookies" },
    { id: "prod-3", name: "Pottery Vase" },
];

export default function ActivatePage() {
    const [qrId, setQrId] = useState("");
    const [selectedProduct, setSelectedProduct] = useState(PRODUCTS[0].id);
    const [pinCode, setPinCode] = useState("1234");
    const [status, setStatus] = useState<"IDLE" | "SUCCESS">("IDLE");

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

    const handleActivate = async (e: React.FormEvent) => {
        e.preventDefault();

        // In a real app, you would get the token from Cognito session (e.g. via NextAuth or Amplify)
        // For this prototype, we'll assume the API allows testing or we pass a placeholder if auth is disabled for dev
        // BUT we enabled Cognito Authorizer. 
        // We need a token. Since we haven't implemented full Login UI for Shop yet (just mock dashboard),
        // we might hit 401. 
        // For now, let's implement the call structure.

        // TODO: Get real JWT token
        const token = "mock-token-placeholder";

        const res = await fetch(`${API_URL}/shop/activate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // "Authorization": `Bearer ${token}` // This will fail without real token if Auth is on
            },
            body: JSON.stringify({
                qr_id: qrId,
                product_id: selectedProduct,
                pin_code: pinCode
            }),
        });

        if (res.ok) {
            setStatus("SUCCESS");
        } else {
            const errorData = await res.json();
            alert(`Activation failed: ${errorData.message}`);
        }
    };

    if (status === "SUCCESS") {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
                <Card className="w-full max-w-md text-center">
                    <CardHeader>
                        <CardTitle className="text-green-600">Activation Successful!</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p>The Gift Card is now active.</p>
                        <Button onClick={() => { setStatus("IDLE"); setQrId(""); }} className="w-full">
                            Activate Another
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Activate Gift Card</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleActivate} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="qr">QR Code ID (Simulation)</Label>
                            <Input
                                id="qr"
                                placeholder="Scan or enter UUID"
                                value={qrId}
                                onChange={(e) => setQrId(e.target.value)}
                                required
                            />
                            <p className="text-xs text-gray-500">In real app, this would be a camera scanner.</p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="product">Select Product</Label>
                            <select
                                id="product"
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                value={selectedProduct}
                                onChange={(e) => setSelectedProduct(e.target.value)}
                            >
                                {PRODUCTS.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="pin">PIN Code (Verification)</Label>
                            <Input
                                id="pin"
                                value={pinCode}
                                onChange={(e) => setPinCode(e.target.value)}
                                disabled
                                className="bg-gray-100"
                            />
                            <p className="text-xs text-gray-400">PIN is pre-printed on card.</p>
                        </div>

                        <Button type="submit" className="w-full">Activate</Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
