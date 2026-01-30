"use client";

import { useState, useEffect } from "react";
import { notFound } from "next/navigation";
import { getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { APP_CONFIG } from "@/lib/config";
import jsPDF from 'jspdf';
const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function AdminPage() {
    const [count, setCount] = useState(10);
    const [generatedBatches, setGeneratedBatches] = useState<any[]>([]);
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null); // null = loading


    useEffect(() => {
        const checkAuth = async () => {
            try {
                const session = await fetchAuthSession();
                const token = session.tokens?.idToken?.toString();

                // APIを叩く
                const res = await fetch(`${NEXT_PUBLIC_API_URL}/admin`, {
                    headers: { "Authorization": `Bearer ${token}` }
                });

                // 404が返ってきたら、即座に notFound 実行
                if (res.status === 404) {
                    setIsAuthorized(false);
                    return notFound(); // 直接 return する
                }

                if (res.ok) {
                    setIsAuthorized(true);
                } else {
                    setIsAuthorized(false);
                    return notFound();
                }
            } catch (e) {
                console.error("Auth check failed", e);
                setIsAuthorized(false);
                return notFound(); // ここで標準404へ

            }
        };
        checkAuth();
    }, []);



    // notFound();
    if (isAuthorized === null) {
        return null; // 判定が終わるまでページの中身を一切レンダリングさせない
    }

    if (isAuthorized === false) {
        notFound();
        return null;
    }


    const handleGenerate = async () => {
        try {
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();

            const res = await fetch(`${NEXT_PUBLIC_API_URL}/admin/qrcodes/generate`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ count }),
            });

            if (res.ok) {
                const data = await res.json();
                const now = new Date();
                const pad = (n: number) => n.toString().padStart(2, '0');
                const timeStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
                const ms = Math.floor(now.getMilliseconds() / 10).toString().padStart(2, '0');

                const newBatch = {
                    id: `batch-${timeStr}${ms}`,
                    count: data.count,
                    date: now.toLocaleString(),
                    status: "Ready",
                    codes: data.data // Store the codes
                };
                setGeneratedBatches([newBatch, ...generatedBatches]);
                // In a real app, we would process 'data.data' (UUIDs/PINs) to generate PDF/CSV 
                console.log("Generated Codes:", data.data);

                // Automatically download PDF
                await generatePDF(newBatch);
            } else {
                alert("Failed to generate QR codes");
            }
        } catch (e) {
            console.error(e);
            alert("Error generating codes");
        }
    };

    const generatePDF = async (batch: any) => {
        const codes = batch.codes || [];
        if (codes.length === 0) return;

        // Dynamic import for QRCodeStyling to ensure it runs on client
        const QRCodeStyling = (await import('qr-code-styling')).default;

        const doc = new jsPDF();
        const APP_URL = process.env.NEXT_PUBLIC_APP_URL || ''; // Replaced by process.env.APP_URL

        // Background Image
        const bgImgf = new Image();
        const bgImgb = new Image();
        bgImgf.src = '/cardimage-f-1.png';
        bgImgb.src = '/cardimage-b-1.png';
        await new Promise((resolve) => {
            bgImgf.onload = resolve;
            bgImgb.onload = resolve;
        });


        // Layout Settings for A4
        const pageWidth = 210; // mm
        const pageHeight = 297; // mm

        // Card Size
        const cardWidth = 85.60; // mm
        const cardHeight = 53.98; // mm

        const cols = 2;
        const rows = 5;

        // Calculate Margins to Center the Grid
        const totalGridWidth = cols * cardWidth;
        const totalGridHeight = rows * cardHeight;
        const marginLeft = (pageWidth - totalGridWidth) / 2;
        const marginTop = (pageHeight - totalGridHeight) / 2;

        const itemsPerPage = cols * rows;

        // Helper to get position
        const getFrontPos = (indexInPage: number) => {
            const row = Math.floor(indexInPage / cols);
            const col = indexInPage % cols;
            return {
                x: marginLeft + col * cardWidth,
                y: marginTop + row * cardHeight
            };
        };

        // Helper for Back Page (Mirrored columns)
        // If col 0 -> print at col 1 pos (so it is behind col 0 when flipped on long edge)
        // If col 1 -> print at col 0 pos
        const getBackPos = (indexInPage: number) => {
            const row = Math.floor(indexInPage / cols);
            const col = indexInPage % cols;
            const mirroredCol = cols - col - 1;
            return {
                x: marginLeft + mirroredCol * cardWidth,
                y: marginTop + row * cardHeight
            };
        };

        for (let i = 0; i < codes.length; i += itemsPerPage) {
            if (i > 0) doc.addPage();
            const pageCodes = codes.slice(i, i + itemsPerPage);

            // FRONT PAGE (QR Codes)
            for (let j = 0; j < pageCodes.length; j++) {
                const code = pageCodes[j];
                const { x, y } = getFrontPos(j);

                // Draw Background Image
                doc.addImage(bgImgf, 'PNG', x, y, cardWidth, cardHeight);

                // Create Custom QR
                //https://qr-code-styling.com/
                const qr = new QRCodeStyling({
                    width: 300,
                    height: 300,
                    data: `${process.env.APP_URL}/receive/${code.uuid}`,
                    image: APP_CONFIG.QR_LOGO_PATH, // Placeholder Logo
                    qrOptions: {
                        typeNumber: 0,
                        mode: "Byte",
                        errorCorrectionLevel: "Q"
                    },
                    imageOptions: {
                        saveAsBlob: true,
                        hideBackgroundDots: true,
                        imageSize: 0.4,
                        margin: 0
                    },
                    dotsOptions: {
                        type: "dots",
                        color: "#6a1a4c",
                        roundSize: true,
                        gradient: {
                            type: "radial",
                            rotation: 0,
                            colorStops: [
                                { offset: 0, color: "#383838" },
                                { offset: 1, color: "#000000" }
                            ]
                        }
                    },
                    backgroundOptions: {
                        round: 0,
                        color: "#ffffff" // Transparent background for QR not supported well in all viewers, keeping white for safety or custom
                    },
                    cornersSquareOptions: {
                        type: "extra-rounded",
                        color: "#000000"
                    },
                    cornersDotOptions: {
                        type: "dot",
                        color: "#000000"
                    },
                });

                // Get Raw Data (Blob) -> Base64
                const rawData = await qr.getRawData('png');
                if (!rawData) continue;

                // Ensure we have a Blob (qr-code-styling can return Buffer in Node environment)
                const blob = rawData instanceof Blob ? rawData : new Blob([rawData as any]);

                const base64data = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                });

                // Draw Corner Dots (Cut marks)
                doc.setFillColor(0, 0, 0); // Black
                const dotRadius = 0.5; // mm radius

                // Top Left
                doc.circle(x, y, dotRadius, 'F');
                // Top Right
                doc.circle(x + cardWidth, y, dotRadius, 'F');
                // Bottom Left
                doc.circle(x, y + cardHeight, dotRadius, 'F');
                // Bottom Right
                doc.circle(x + cardWidth, y + cardHeight, dotRadius, 'F');

                // Draw QR
                const qrSize = 26; // Slightly smaller to fit better
                // Position QR: Center horizontally, slightly above center vertically or as per design
                // Let's place it somewhat centrally
                doc.addImage(base64data, 'PNG', x + (cardWidth - qrSize) - 4, y + cardHeight / 2 - qrSize / 2 + 8, qrSize, qrSize);

                doc.setFontSize(12);
                doc.setTextColor(255, 255, 255); // White text assuming dark background, change if needed
                doc.setFont("helvetica", "bold");
                // const textWidth = doc.getTextWidth(`Gift for you !`);
                // doc.text(`Gift for you !`, x + (cardWidth - textWidth) / 2, y + 10);
            }

            doc.addPage(); // Back Page

            // BACK PAGE (PIN Codes)
            for (let j = 0; j < pageCodes.length; j++) {
                const code = pageCodes[j];
                const { x, y } = getBackPos(j);

                // Draw Background Image (Reuse same bg or different back bg?)
                // Assuming same bg for now, typically back has instructions
                doc.addImage(bgImgb, 'PNG', x, y, cardWidth, cardHeight);

                // Draw Corner Dots
                doc.setFillColor(0, 0, 0); // Black
                const dotRadius = 0.5;

                // Top Left
                doc.circle(x, y, dotRadius, 'F');
                // Top Right
                doc.circle(x + cardWidth, y, dotRadius, 'F');
                // Bottom Left
                doc.circle(x, y + cardHeight, dotRadius, 'F');
                // Bottom Right
                doc.circle(x + cardWidth, y + cardHeight, dotRadius, 'F');

                // Draw PIN
                doc.setTextColor(0, 0, 0); // Reset to black or keep white depending on BG
                // Let's make a white box for text readability if bg is complex, or just use white text with shadow
                // Simple approach: White Text
                doc.setTextColor(255, 255, 255);
                doc.setTextColor(0, 0, 0);

                doc.setFontSize(10);
                doc.setFont("helvetica", "normal");
                // const labelWidth = doc.getTextWidth("Security PIN");
                // doc.text("Security PIN", x + (cardWidth - labelWidth) / 2, y + cardHeight / 2 - 8);

                doc.setFontSize(20);
                doc.setFont("helvetica", "bold");
                const pinWidth = doc.getTextWidth(code.pin);
                doc.text(code.pin, x + (cardWidth - pinWidth) / 2 + 10, y + 16);

                doc.setFontSize(5);
                doc.setFont("helvetica", "normal");
                const uuidText = `${code.uuid.substring(0, 16)}...`;
                const uuidWidth = doc.getTextWidth(uuidText);
                doc.text(uuidText, x + (cardWidth - uuidWidth) / 2, y + cardHeight - 1);
            }
        }

        doc.save(`qrcodes-${batch.id}.pdf`);
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
                                            <Button variant="outline" size="sm" onClick={() => generatePDF(batch)}>Download PDF</Button>
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

                <QRCodeListSection apiUrl={NEXT_PUBLIC_API_URL} />
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
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();

            const res = await fetch(`${apiUrl}/admin/qrcodes?status=${status}`, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
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

    const handleDeleteAllBanned = async () => {
        if (status !== 'BANNED') return;
        if (!confirm('Are you sure you want to DELETE ALL BANNED QR codes? This action cannot be undone.')) return;

        setLoading(true);
        try {
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();

            const res = await fetch(`${apiUrl}/admin/qrcodes/banned`, {
                method: 'DELETE',
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            if (res.ok) {
                const data = await res.json();
                alert(`Successfully deleted ${data.count} BANNED codes.`);
                fetchCodes(); // Refresh list
            } else {
                alert('Failed to delete Banned codes');
            }
        } catch (e) {
            console.error(e);
            alert('Error deleting Banned codes');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex justify-between items-center">
                    <span>All QR Codes</span>
                    <div className="flex gap-2">
                        {status === 'BANNED' && (
                            <Button variant="destructive" size="sm" onClick={handleDeleteAllBanned} disabled={loading}>
                                Delete All BANNED
                            </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={fetchCodes} disabled={loading}>
                            {loading ? "Loading..." : "Refresh"}
                        </Button>
                    </div>
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
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();

            const res = await fetch(`${apiUrl}/admin/qrcodes/${uuid}/ban`, {
                method: 'POST',
                headers: {
                    "Authorization": `Bearer ${token}`
                }
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
