
"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

// Mock Data
const MOCK_ORDERS = [
    { id: "ord-1", product: "Premium Sake Set", recipient: "Alice Smith", address: "123 Apple St, Tokyo", status: "USED" },
    { id: "ord-2", product: "Matcha Cookies", recipient: "Bob Jones", address: "456 Orange Ave, Osaka", status: "USED" },
    { id: "ord-3", product: "Pottery Vase", recipient: "Charlie Brown", address: "789 Pine Rd, Kyoto", status: "SHIPPED" },
];

export default function ShopDashboard() {
    const [orders, setOrders] = useState(MOCK_ORDERS);

    const markAsShipped = (id: string) => {
        setOrders(orders.map(o => o.id === id ? { ...o, status: "SHIPPED" } : o));
    };

    const pendingOrders = orders.filter(o => o.status === "USED");

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-4xl mx-auto space-y-6">
                <header className="flex justify-between items-center">
                    <h1 className="text-2xl font-bold">Shop Dashboard</h1>
                    <Link href="/shop/activate">
                        <Button>Activate New QR (Scan)</Button>
                    </Link>
                </header>

                <div className="grid gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Orders to Ship ({pendingOrders.length})</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {pendingOrders.length === 0 ? (
                                <p className="text-gray-500">No pending orders.</p>
                            ) : (
                                <ul className="space-y-4">
                                    {pendingOrders.map(order => (
                                        <li key={order.id} className="border p-4 rounded-md flex justify-between items-center bg-white">
                                            <div>
                                                <p className="font-bold">{order.product}</p>
                                                <p className="text-sm">To: {order.recipient}</p>
                                                <p className="text-xs text-gray-500">{order.address}</p>
                                            </div>
                                            <Button size="sm" onClick={() => markAsShipped(order.id)}>Mark Shipped</Button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Recent History</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="space-y-2 text-sm text-gray-600">
                                {orders.filter(o => o.status === "SHIPPED").map(order => (
                                    <li key={order.id} className="flex justify-between">
                                        <span>{order.product} ({order.recipient})</span>
                                        <span className="text-green-600">Shipped</span>
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
