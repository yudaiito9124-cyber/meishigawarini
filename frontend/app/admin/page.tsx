
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"; // Need to install table if not present, but using simple div for now or install

export default function AdminPage() {
    const [count, setCount] = useState(10);
    const [generatedBatches, setGeneratedBatches] = useState<any[]>([]);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

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
                        <CardTitle>History</CardTitle>
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
            </div>
        </div>
    );
}
