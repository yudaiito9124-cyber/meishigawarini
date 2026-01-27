
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from 'aws-amplify/auth';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AdminPage() {
    const router = useRouter();
    const [count, setCount] = useState(10);
    const [generatedBatches, setGeneratedBatches] = useState<any[]>([]);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

    useEffect(() => {
        const checkAuth = async () => {
            try {
                await getCurrentUser();
            } catch (e) {
                router.replace('/login');
            }
        };
        checkAuth();
    }, [router]);

    const handleGenerate = async () => {
        const res = await fetch(`${API_URL}/admin/qrcodes/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ count }),
        });

        if (res.ok) {
            const data = await res.json();
            const newBatch = {
                id: `batch-${Date.now()}`,
                count: data.count,
                date: new Date().toLocaleString(),
                status: "Ready",
                codes: data.data // Store the codes
            };
            setGeneratedBatches([newBatch, ...generatedBatches]);
            // In a real app, we would process 'data.data' (UUIDs/PINs) to generate PDF/CSV 
            console.log("Generated Codes:", data.data);
        } else {
            alert("Failed to generate QR codes");
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-4xl mx-auto space-y-6">
                <h1 className="text-2xl font-bold">Admin Dashboard</h1>

                <Card>
                    <CardHeader>
                        <CardTitle>Generate QR Codes</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-end gap-4">
                            <div className="grid w-full max-w-sm items-center gap-1.5">
                                <label htmlFor="count" className="text-sm font-medium">Quantity to Generate</label>
                                <Input
                                    id="count"
                                    type="number"
                                    value={count}
                                    onChange={(e) => setCount(Number(e.target.value))}
                                />
                            </div>
                            <Button onClick={handleGenerate}>Generate</Button>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Currentry Generated QR Codes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {generatedBatches.length === 0 ? <p className="text-gray-500">No batches generated yet.</p> : (
                                generatedBatches.map(batch => (
                                    <div key={batch.id} className="bg-white border p-4 rounded-md">
                                        <div className="flex justify-between items-center mb-2">
                                            <div>
                                                <p className="font-medium">Batch: {batch.id}</p>
                                                <p className="text-sm text-gray-500">{batch.count} codes • {batch.date}</p>
                                            </div>
                                            <span className="text-sm bg-green-100 text-green-800 px-2 py-1 rounded">
                                                {batch.status}
                                            </span>
                                        </div>
                                        {/* Display Codes */}
                                        <div className="mt-2 bg-gray-100 p-2 rounded text-xs font-mono overflow-auto max-h-40">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr>
                                                        <th>UUID</th>
                                                        <th>PIN</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {batch.codes?.map((code: any) => (
                                                        <tr key={code.uuid}>
                                                            <td className="pr-4 select-all">{code.uuid}</td>
                                                            <td className="select-all">{code.pin}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* <div className="border-t pt-6"></div> */}

                <QRCodeListSection apiUrl={API_URL} />
            </div>
        </div>
    );
}

function QRCodeListSection({ apiUrl }: { apiUrl: string }) {
    const [status, setStatus] = useState("UNASSIGNED");
    const [codes, setCodes] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchCodes = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${apiUrl}/admin/qrcodes?status=${status}`);
            if (res.ok) {
                const data = await res.json();
                setCodes(data.items || []);
            } else {
                console.error("Failed to fetch codes");
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    // Initial fetch when invalidating or status changes? 
    // Let's make it manual for now or useEffect
    // useEffect(() => { fetchCodes(); }, [status]); 

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex justify-between items-center">
                    <span>All QR Codes</span>
                    <Button variant="outline" size="sm" onClick={fetchCodes} disabled={loading}>
                        {loading ? "Loading..." : "Refresh"}
                    </Button>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex gap-2">
                    {["UNASSIGNED", "LINKED", "ACTIVE", "USED", "SHIPPED", "BANNED"].map((s) => (
                        <Button
                            key={s}
                            variant={status === s ? "default" : "secondary"}
                            onClick={() => {
                                setStatus(s);
                                // optional: auto fetch on click
                                // setTimeout(fetchCodes, 0); 
                            }}
                        >
                            {s}
                        </Button>
                    ))}
                </div>

                <div className="bg-white border rounded-md p-4">
                    <p className="text-sm text-gray-500 mb-2">
                        Showing status: <span className="font-bold">{status}</span> • Count: {codes.length}
                    </p>
                    <div className="overflow-auto max-h-96">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>UUID</TableHead>
                                    <TableHead>PIN</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Created At</TableHead>
                                    <TableHead>Fraud?</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {codes.length === 0 ? (  // there is nocodes 
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center text-gray-500">
                                            No codes found. Press Refresh to load.
                                        </TableCell>
                                    </TableRow>
                                ) : ( // there is some codes
                                    codes.map((item: any) => (
                                        <TableRow key={item.PK}>
                                            <TableCell className="font-mono text-xs select-all">
                                                {item.PK.replace('QR#', '')}
                                            </TableCell>
                                            <TableCell className="font-mono text-xs select-all">
                                                {item.pin}
                                            </TableCell>
                                            <TableCell>
                                                <span className={`px-2 py-1 rounded text-xs ${item.status === 'UNASSIGNED' ? 'bg-gray-100' :
                                                    item.status === 'ACTIVE' ? 'bg-blue-100 text-blue-800' :
                                                        item.status === 'USED' ? 'bg-yellow-100 text-yellow-800' :
                                                            item.status === 'BANNED' ? 'bg-red-100 text-red-800' : // BANNED style
                                                                'bg-green-100 text-green-800'
                                                    }`}>
                                                    {item.status}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-xs text-gray-500">
                                                {item.created_at ? new Date(item.created_at).toLocaleString() : '-'}
                                            </TableCell>
                                            <TableCell>
                                                {item.status !== 'BANNED' && (
                                                    <BanButton uuid={item.PK.replace('QR#', '')} apiUrl={apiUrl} onSuccess={fetchCodes} />
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function BanButton({ uuid, apiUrl, onSuccess }: { uuid: string, apiUrl: string, onSuccess: () => void }) {
    const [loading, setLoading] = useState(false);

    const handleBan = async () => {
        if (!confirm('Are you sure you want to BAN this QR code? It will stop working immediately.')) return;
        setLoading(true);
        try {
            const res = await fetch(`${apiUrl}/admin/qrcodes/${uuid}/ban`, {
                method: 'POST'
            });
            if (res.ok) {
                onSuccess();
            } else {
                alert('Failed to ban QR code');
            }
        } catch (e) {
            console.error(e);
            alert('Error banning QR code');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Button variant="destructive" size="sm" onClick={handleBan} disabled={loading} className="h-6 text-xs bg-red-600 hover:bg-red-700">
            {loading ? '...' : 'Ban'}
        </Button>
    );
}
