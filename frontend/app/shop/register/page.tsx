"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function ShopRegisterPage() {
    const [name, setName] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

    const handleRegister = async () => {
        if (!name) return;
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/shops`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            if (res.ok) {
                const data = await res.json();
                router.push(`/shop/${data.shop_id}`);
            } else {
                alert("Failed to register shop");
            }
        } catch (error) {
            console.error(error);
            alert("Error registering shop");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Register New Shop</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <label htmlFor="name" className="text-sm font-medium">Shop Name</label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter your shop name"
                        />
                    </div>
                    <Button onClick={handleRegister} className="w-full" disabled={loading}>
                        {loading ? "Registering..." : "Create Shop"}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
