
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function ShopDashboard() {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/shop/orders`);
            if (res.ok) {
                const data = await res.json();
                setOrders(data.orders || []);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
    }, []);

    const markAsShipped = async (id: string) => {
        // Optimistic update
        const originalOrders = [...orders];
        setOrders(orders.filter(o => o.id !== id)); // Remove from list immediately or move to shipped? 
        // Logic: Dashboard 'Orders to Ship' uses 'USED'. History?? 
        // The API returns 'USED' orders only (mostly). So let's just remove it or refresh.
        // Actually, let's call API and then refresh.

        try {
            const tracking = prompt("Enter Tracking Number (Optional):");
            const res = await fetch(`${API_URL}/shop/orders/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tracking_number: tracking })
            });

            if (res.ok) {
                // Refresh list
                fetchOrders();
            } else {
                alert("Failed to mark as shipped");
                setOrders(originalOrders);
            }
        } catch (e) {
            alert("Error");
            setOrders(originalOrders);
        }
    };

    // Note: The API currently only returns 'USED' orders from queries. 
    // Shipped history is not returned by the current /shop/orders endpoint (it filters by status=USED).
    // So 'Recent History' section will be empty unless we fetch SHIPPED orders too.
    // For this prototype, I'll just show pending orders.
    // Or I can keep local history of what I just shipped in this session for UX.

    // For now, let's focus on Pending Orders.

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-4xl mx-auto space-y-6">
                <header className="flex justify-between items-center">
                    <h1 className="text-2xl font-bold">Shop Dashboard</h1>
                    <div className="space-x-2">
                        <Link href="/shop/link">
                            <Button variant="outline">Link QR (Initial)</Button>
                        </Link>
                        <Link href="/shop/activate">
                            <Button>Activate QR (Sale)</Button>
                        </Link>
                    </div>
                </header>

                <div className="grid gap-6">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Orders to Ship ({orders.length})</CardTitle>
                            <Button variant="ghost" className="h-8 w-8 p-0" onClick={fetchOrders}>
                                ↻
                            </Button>
                        </CardHeader>
                        <CardContent>
                            {loading ? <p>Loading...</p> : orders.length === 0 ? (
                                <p className="text-gray-500">No pending orders.</p>
                            ) : (
                                <ul className="space-y-4">
                                    {orders.map(order => (
                                        <li key={order.id} className="border p-4 rounded-md flex justify-between items-center bg-white">
                                            <div>
                                                <p className="font-bold">
                                                    {/* Map product_id to name if possible, or just show ID */}
                                                    Product: {order.product_id}
                                                </p>
                                                <p className="text-sm">To: {order.recipient_name}</p>
                                                <p className="text-xs text-gray-500">
                                                    {order.postal_code} {order.address}
                                                </p>
                                                <p className="text-xs text-blue-600">
                                                    Slot: {order.shipping_info?.delivery_slot}
                                                </p>
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
                            <p className="text-sm text-gray-400">Shipped orders are archived.</p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
