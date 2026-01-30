"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import QRScanner from "@/components/ui/qr-scanner";


// Mock Products
const PRODUCTS = [
    { id: "prod-1", name: "Premium Sake Set" },
    { id: "prod-2", name: "Matcha Cookies" },
    { id: "prod-3", name: "Pottery Vase" },
];

export default function LinkPage() {
    const [qrId, setQrId] = useState("");
    const [selectedProduct, setSelectedProduct] = useState(PRODUCTS[0].id);
    const [activateNow, setActivateNow] = useState(false);
    const [status, setStatus] = useState<"IDLE" | "SUCCESS">("IDLE");

    // Scanner State
    const [isScanning, setIsScanning] = useState(false);

    const handleScanSuccess = (decodedText: string) => {
        let uuid = decodedText;
        if (decodedText.includes('/')) {
            uuid = decodedText.split('/').pop() || decodedText;
        }
        setQrId(uuid);
        setIsScanning(false);
    };

    const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";

    const handleLink = async (e: React.FormEvent) => {
        e.preventDefault();

        // TODO: Get real JWT token
        const token = "mock-token-placeholder";

        const res = await fetch(`${NEXT_PUBLIC_API_URL}/shop/activate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // "Authorization": `Bearer ${token}` 
            },
            body: JSON.stringify({
                qr_id: qrId,
                product_id: selectedProduct,
                action: "LINK",
                activate_now: activateNow
            }),
        });

        if (res.ok) {
            setStatus("SUCCESS");
        } else {
            const errorData = await res.json();
            alert(`Link failed: ${errorData.message}`);
        }
    };

    if (status === "SUCCESS") {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
                <Card className="w-full max-w-md text-center">
                    <CardHeader>
                        <CardTitle className="text-green-600">
                            {activateNow ? "Linked & Activated!" : "Linked Successfully!"}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p>The Gift Card is now {activateNow ? "active" : "linked to product"}.</p>
                        <Button onClick={() => { setStatus("IDLE"); setQrId(""); }} className="w-full">
                            Link Another
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
                    <CardTitle>Link QR to Product</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleLink} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="qr">QR Code ID</Label>
                            <div className="flex gap-2">
                                <Input
                                    id="qr"
                                    placeholder="Scan or enter UUID"
                                    value={qrId}
                                    onChange={(e) => setQrId(e.target.value)}
                                    required
                                />
                                <Dialog open={isScanning} onOpenChange={setIsScanning}>
                                    <DialogTrigger asChild>
                                        <Button type="button" variant="outline">Scan</Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Scan QR Code</DialogTitle>
                                            <DialogDescription>Position the QR code within the frame.</DialogDescription>
                                        </DialogHeader>
                                        <div className="p-4 min-h-[300px]">
                                            <QRScanner
                                                qrCodeSuccessCallback={handleScanSuccess}
                                                qrbox={250}
                                                disableFlip={false}
                                            />
                                        </div>
                                        <DialogFooter>
                                            <Button type="button" variant="ghost" onClick={() => setIsScanning(false)}>Cancel</Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="product">Select Product</Label>
                            <select
                                id="product"
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={selectedProduct}
                                onChange={(e) => setSelectedProduct(e.target.value)}
                            >
                                {PRODUCTS.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center space-x-2 pt-2">
                            <input
                                type="checkbox"
                                id="activateNow"
                                checked={activateNow}
                                onChange={(e) => setActivateNow(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <Label htmlFor="activateNow" className="cursor-pointer">
                                Activate immediately (Customer Purchase)
                            </Label>
                        </div>

                        <Button type="submit" className="w-full">
                            {activateNow ? "Link & Activate" : "Link Only"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
