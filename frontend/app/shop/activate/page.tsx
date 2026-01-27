"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import QRScanner from "@/components/ui/qr-scanner";

export default function ActivatePage() {
    const [qrId, setQrId] = useState("");
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

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

    const handleActivate = async (e: React.FormEvent) => {
        e.preventDefault();

        // TODO: Get real JWT token
        const token = "mock-token-placeholder";

        const res = await fetch(`${API_URL}/shop/activate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // "Authorization": `Bearer ${token}` 
            },
            body: JSON.stringify({
                qr_id: qrId,
                action: "ACTIVATE"
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
                        <p>The Gift Card is now active and ready for the customer.</p>
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
                            <p className="text-xs text-gray-500">
                                This action will activate a card that is already linked to a product.
                            </p>
                        </div>

                        <Button type="submit" className="w-full">
                            Activate Now
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
