/**
 * ファイル概要: システム管理者向けダッシュボード
 * 目的: QRコードのバッチ生成機能や生成履歴の確認、およびQRコードの個別ステータス管理やBAN処理を行います。
 */
"use client";

import { useState, useEffect, useRef } from "react";
import { notFound } from "next/navigation";
import { getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { APP_CONFIG } from "@/lib/config";
import jsPDF from 'jspdf';
import { generateId } from '@/lib/id';
import { useTranslations } from 'next-intl';
import { generatePDF } from '@/lib/generatePDF';
import { ExternalLink, Copy } from 'lucide-react';
const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";
const PDF_PAPER_FORMAT = "10S31251"; //"1S31034"
const PDF_CARD_FORMAT = "gakuchousenbeiv1"; //"gakuchousenbeiv0"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Link, useRouter } from '@/i18n/routing';

export default function AdminPage() {
    const t = useTranslations('AdminPage');
    const tb = useTranslations('Backend');
    const [count, setCount] = useState(10);
    const [keyword, setKeyword] = useState("");
    const [shopId, setShopId] = useState("");
    const [productId, setProductId] = useState("");
    const [ownerUuid, setOwnerUuid] = useState("");
    const [senderId, setSenderId] = useState("");
    const [expiryDate, setExpiryDate] = useState("");
    const [activateNow, setActivateNow] = useState(false);
    const [useMetadataOptions, setUseMetadataOptions] = useState(false);
    const [generatedBatches, setGeneratedBatches] = useState<any[]>([]);
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null); // null = loading
    const [papertype, setPapertype] = useState<"1S31034-gakuchousenbeiv1" | "10S31251">("1S31034-gakuchousenbeiv1");
    const [isGenerating, setIsGenerating] = useState(false);
    const router = useRouter();
    const hasCheckedAuth = useRef(false);

    useEffect(() => {
        if (hasCheckedAuth.current) return;
        hasCheckedAuth.current = true;

        const checkAuth = async () => {
            let isAdmin = false;
            try {
                let session = await fetchAuthSession();
                let payload = session.tokens?.idToken?.payload || {};
                let groups = (payload['cognito:groups'] as string[]) || [];
                isAdmin = groups.includes('Administrators') || groups.includes('GlobalAdmins');

                // 1. まず管理者グループに属しているかフロントで簡易チェック
                if (!isAdmin) {
                    setIsAuthorized(false);
                    return notFound();
                }

                // console.log("Admin access verification in progress...");
                let amr = (payload['amr'] as string[]) || [];
                // amrが空の場合、一度だけ強制リフレッシュを試みる（最新の認証情報を取得するため）
                if (amr.length === 0) {
                    session = await fetchAuthSession({ forceRefresh: true });
                    payload = session.tokens?.idToken?.payload || {};
                    amr = (payload['amr'] as string[]) || [];
                }

                const token = session.tokens?.idToken?.toString();

                // 3. 実際にAPIを叩いてAuthorizerでの検証を確認 (amrがなくてもAuthorizerがCognitoを直接チェックする)
                const res = await fetch(`${NEXT_PUBLIC_API_URL}/admin`, {
                    headers: { "Authorization": `Bearer ${token}` }
                });

                if (res.status === 404 || res.status === 403) {
                    // console.error("Access denied by backend authorizer.");
                    setIsAuthorized(false);
                    return;
                }

                if (res.ok) {
                    setIsAuthorized(true);
                } else {
                    setIsAuthorized(false);
                    alert(t("AdminNeed2FA"))
                    router.push("/mfa-setup")
                    return;
                }
            } catch (e) {
                if (isAdmin && e instanceof Error && e.message === "Failed to fetch") {
                    alert(t("AdminNeed2FA"))
                    router.push("/mfa-setup")
                    return;
                }
                // console.error("Auth check failed", e);
                setIsAuthorized(false);
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
        setIsGenerating(true);
        try {
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();

            const res = await fetch(`${NEXT_PUBLIC_API_URL}/admin/qrcodes/generate`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    count,
                    ...(useMetadataOptions ? {
                        shopId: shopId || undefined,
                        productId: productId || undefined,
                        owner_uuid: ownerUuid || undefined,
                        senderId: senderId || undefined,
                        expiry_date: expiryDate ? new Date(expiryDate).toISOString() : undefined,
                        activate_now: activateNow
                    } : {})
                }),
            });

            if (res.ok) {
                const data = await res.json();
                const batchid = `batch-${data.batch_id}`;
                const now = new Date();

                const newBatch = {
                    id: batchid,
                    count: data.count,
                    date: now.toLocaleString(),
                    status: t('batches.status.ready'),
                    codes: data.data // Store the codes
                };
                setGeneratedBatches([newBatch, ...generatedBatches]);
                // In a real app, we would process 'data.data' (UUIDs/PINs) to generate PDF/CSV 
                // console.log("Generated Codes:", data.data);

                // Automatically download PDF
                await generatePDF(newBatch, PDF_PAPER_FORMAT, PDF_CARD_FORMAT);
            } else {
                const errData = await res.json().catch(() => null);
                // console.error(errData);
                alert((tb(errData?.message?.replace(/\./g, '_')) || errData?.message) || t('batches.alerts.failed') + (errData?.detail?.toString() || ''));
            }
        } catch (e) {
            alert(t('batches.alerts.error') + JSON.stringify(e));
        } finally {
            setIsGenerating(false);
        }
    };


    return (
        <div className="min-h-screen bg-mist-900 p-8 text-white"> {/* bg-[#383838] */}
            <div className="max-w-7xl mx-auto space-y-6">
                <div className="flex justify-between items-center flex-wrap gap-4">
                    <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
                    <Link href="/login">
                        <Button variant="destructive" className="shadow-md cursor-pointer border border-red-900">
                            {t('qrAdminLoginPage')}
                        </Button>
                    </Link>
                </div>

                {/* QRコード生成 */}
                <Card>
                    <CardHeader>
                        <CardTitle>{t('generate.title')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-col w-full gap-1.5">
                            <div className="grid w-full items-center gap-1.5">
                                <label htmlFor="count" className="text-sm font-medium">{t('generate.quantity')}</label>
                                <Input
                                    id="count"
                                    type="number"
                                    value={count}
                                    onChange={(e) => setCount(Number(e.target.value))}
                                />
                            </div>

                            <div className="flex items-center gap-2 mt-4">
                                <Switch
                                    id="useMetadataOptions"
                                    checked={useMetadataOptions}
                                    onCheckedChange={(checked: boolean) => setUseMetadataOptions(checked)}
                                />
                                <Label htmlFor="useMetadataOptions" className="text-sm font-medium cursor-pointer">
                                    {t('generate.useMetadata')}
                                </Label>
                            </div>

                            <label htmlFor="shopId" className="text-sm font-medium mb-0 mt-2">{t('generate.option')}</label>
                            <div className={cn(
                                "grid w-full items-center gap-2 p-4 rounded-xl bg-gray-100 border border-gray-200 border-dashed border-5 transition-all duration-200",
                                !useMetadataOptions && "opacity-50 grayscale pointer-events-none"
                            )}>
                                <div className="grid w-full items-center gap-1.5">
                                    <div className="flex items-center gap-2">
                                        <div className={cn("w-3 h-3 rounded-full items-center justify-center", shopId ? "bg-red-500" : "bg-gray-500")}></div>
                                        <label htmlFor="shopId" className="text-sm font-medium">{t('generate.shopId')}</label>
                                    </div>
                                    <Input
                                        id="shopId"
                                        type="text"
                                        value={shopId}
                                        placeholder="UUID..."
                                        onChange={(e) => setShopId(e.target.value)}
                                    />
                                </div>
                                <div className="grid w-full items-center gap-1.5">
                                    <div className="flex items-center gap-2">
                                        <div className={cn("w-3 h-3 rounded-full items-center justify-center", productId ? "bg-red-500" : "bg-gray-500")}></div>
                                        <label htmlFor="productId" className="text-sm font-medium">{t('generate.productId')}</label>
                                    </div>
                                    <Input
                                        id="productId"
                                        type="text"
                                        value={productId}
                                        placeholder="UUID..."
                                        onChange={(e) => setProductId(e.target.value)}
                                    />
                                </div>
                                <div className="grid w-full items-center gap-1.5">
                                    <div className="flex items-center gap-2">
                                        <div className={cn("w-3 h-3 rounded-full items-center justify-center", ownerUuid ? "bg-red-500" : "bg-gray-500")}></div>
                                        <label htmlFor="ownerUuid" className="text-sm font-medium">{t('generate.ownerUuid')}</label>
                                    </div>
                                    <Input
                                        id="ownerUuid"
                                        type="text"
                                        value={ownerUuid}
                                        placeholder="UUID..."
                                        onChange={(e) => setOwnerUuid(e.target.value)}
                                    />
                                </div>
                                <div className="grid w-full items-center gap-1.5">
                                    <div className="flex items-center gap-2">
                                        <div className={cn("w-3 h-3 rounded-full items-center justify-center", senderId ? "bg-red-500" : "bg-gray-500")}></div>
                                        <label htmlFor="senderId" className="text-sm font-medium">{t('generate.senderId')}</label>
                                    </div>
                                    <Input
                                        id="senderId"
                                        type="text"
                                        value={senderId}
                                        placeholder="USER#UUID..."
                                        onChange={(e) => setSenderId(e.target.value)}
                                    />
                                </div>
                                <div className="grid w-full items-center gap-1.5">
                                    <div className="flex items-center gap-2">
                                        <div className={cn("w-3 h-3 rounded-full items-center justify-center", expiryDate ? "bg-red-500" : "bg-gray-500")}></div>
                                        <label htmlFor="expiryDate" className="text-sm font-medium">{t('generate.expiryDate')}</label>
                                    </div>
                                    <Input
                                        id="expiryDate"
                                        type="datetime-local"
                                        value={expiryDate}
                                        onChange={(e) => setExpiryDate(e.target.value)}
                                    />
                                </div>
                                <div className="grid w-full items-center gap-1.5">
                                    <div className="flex items-center gap-2">
                                        <div className={cn("w-3 h-3 rounded-full items-center justify-center", activateNow && shopId && productId ? "bg-red-500" : shopId && productId ? "bg-green-500" : "bg-gray-500")}></div>
                                        <label htmlFor="activateNow" className="text-sm font-medium">{t('generate.activateNow')}</label>
                                    </div>
                                    <Switch
                                        id="activateNow"
                                        checked={(activateNow && shopId && productId) ? true : false}
                                        disabled={!shopId || !productId}
                                        onCheckedChange={(checkedstate: boolean) => setActivateNow(checkedstate)}
                                    />
                                </div>
                            </div>
                            <div className="grid w-full items-center gap-1.5 mt-4">
                                <Button
                                    onClick={handleGenerate}
                                    className="w-full items-center gap-1.5 h-12"
                                    disabled={isGenerating}
                                >
                                    {isGenerating ? (
                                        <>
                                            <span className="animate-spin mr-2">⏳</span>
                                            {t('generate.button')}...
                                        </>
                                    ) : (
                                        t('generate.button')
                                    )}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>


                {/* このページを開いてから生成したQRコードのバッチ一覧 */}
                <Card>
                    <CardHeader>
                        <CardTitle>{t('batches.title')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {generatedBatches.length === 0 ? <p className="text-gray-500">{t('batches.noBatches')}</p> : (
                                generatedBatches.map(batch => (
                                    <div key={batch.id} className="bg-white border p-4 rounded-md">
                                        <div className="flex flex-wrap items-center mb-2">
                                            <div className="flex gap-2 flex-wrap flex-rows items-center">
                                                <div>
                                                    <p className="font-medium">{t('batches.batchId', { id: batch.id })}</p>
                                                    <p className="text-sm text-gray-500">{t('batches.info', { count: batch.count, date: batch.date })}</p>
                                                </div>
                                                <p className="flex justify-center items-center text-sm bg-green-100 text-green-800 px-3 py-1 rounded-xl">{batch.status}</p>
                                            </div>
                                            <Button className="ml-auto" variant="outline" size="sm" onClick={() => generatePDF(batch, PDF_PAPER_FORMAT, PDF_CARD_FORMAT)}>{t('batches.downloadPdf')}</Button>
                                        </div>
                                        {/* Display Codes */}
                                        <div className="mt-2 bg-gray-100 p-2 rounded text-xs font-mono overflow-auto max-h-40">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr>
                                                        <th>{t('batches.table.uuid')}</th>
                                                        <th>{t('batches.table.pin')}</th>
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


                {/* すべてのQRコード一覧 */}
                <QRCodeListSection apiUrl={NEXT_PUBLIC_API_URL} onGeneratePDF={generatePDF} />
            </div>
        </div>
    );
}

function QRCodeListSection({ apiUrl, onGeneratePDF }: { apiUrl: string, onGeneratePDF: (batch: any, paperformat: string, cardformat: string) => Promise<void> }) {
    const t = useTranslations('AdminPage');
    const tShop = useTranslations('ShopPage');
    const ts = useTranslations('Timestamp');
    const st = useTranslations('Status');
    const tt = useTranslations('Time');
    const [status, setStatus] = useState("UNASSIGNED");
    const [keyword, setKeyword] = useState("");
    const [codes, setCodes] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);



    const handleExportCSV = () => {
        if (codes.length === 0) return;

        // Header for CSV
        const headers = [
            t('list.table.uuid'),
            t('list.table.pin'),
            t('list.table.status'),
            t('list.table.createdAt'),
            t('shopInfo.name'),
            t('shopInfo.id'),
            t('shopInfo.contact'),
            tShop('orders.productName'),
            tShop('orders.recipient'),
            tShop('orders.contact'),
            tShop('orders.address'),
            tShop('orders.preferredDateTime'),
            tShop('orders.shipDialog.deliveryCompany'),
            tShop('orders.shipDialog.label'),
            tShop('orders.userMessage'),
            tShop('orders.shopMemo'),
        ];

        // Map data to rows
        const rows = codes.map(item => {
            const uuid = item.PK.replace('QR#', '');
            const statusLabel = st(item.status ? item.status.toLowerCase() : 'active');
            const updatedAt = item.ts_updated_at ? new Date(item.ts_updated_at).toLocaleString() : '-';
            const email = item.shipping_info?.email || '-';
            const phone = item.shipping_info?.phone || '-';
            const contact = `${email}${phone !== '-' ? ' / ' + phone : ''}`;
            const preferredDateTime = `${item.preferred_date ? item.preferred_date : '-'} / ${item.preferred_time ? tt(item.preferred_time) : '-'}`;

            return [
                uuid,
                item.pin || '-',
                statusLabel,
                updatedAt,
                item.shop_name || '-',
                item.shop_id || '-',
                item.shop_email || '-',
                item.product_name || item.product_id || '-',
                item.recipient_name || '-',
                contact,
                item.address || '-',
                preferredDateTime,
                item.delivery_company || '-',
                item.tracking_number || '-',
                item.memo_for_users || '-',
                item.memo_for_shop || '-',
            ];
        });

        // Combine into CSV string
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        // Create blob and download
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const timestamp = generateId();
        link.href = url;
        link.setAttribute('download', `qrcodes-export-${status.toLowerCase()}-${timestamp}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const fetchCodes = async (targetStatus?: string) => {
        setLoading(true);
        try {
            const currentStatus = targetStatus ?? status;
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();

            // Include query param if status is SEARCH
            let url = `${apiUrl}/admin/qrcodes?status=${currentStatus}`;
            if (currentStatus === 'SEARCH' && keyword) {
                url += `&keyword=${encodeURIComponent(keyword)}`;
            }

            const res = await fetch(url, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            if (res.ok) {
                const data = await res.json();
                setCodes(data.items || []);
            } else {
                // console.error("Failed to fetch codes");
            }
        } catch (error) {
            // console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteAllBanned = async () => {
        if (status !== 'BANNED') return;
        if (!confirm(t('list.deleteBanned.confirm'))) return;

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
                alert(t('list.deleteBanned.success', { count: data.count }));
                fetchCodes(); // Refresh list
            } else {
                alert(t('list.deleteBanned.failed'));
            }
        } catch (e) {
            // console.error(e);
            alert(t('list.deleteBanned.error'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle className="flex justify-between items-center">
                    <span>{t('list.title')}</span>
                    <div className="flex gap-2">
                        {status === 'BANNED' && (
                            <Button variant="destructive" size="sm" onClick={handleDeleteAllBanned} disabled={loading}>
                                {t('list.deleteAllBanned')}
                            </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={loading || codes.length === 0}>
                            {t('list.exportCsv')}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => fetchCodes()} disabled={loading}>
                            {loading ? t('list.loading') : t('list.refresh')}
                        </Button>
                    </div>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 ">
                <div className="flex flex-wrap fpex gap-2 justify-start items-center ">
                    {["UNASSIGNED", "LINKED", "ACTIVE", "USED", "SHIPPED", "COMPLETED", "EXPIRED", "BANNED"].map((s) => (
                        <Button
                            key={s}
                            variant={status === s ? "default" : "secondary"}
                            onClick={() => {
                                setStatus(s);
                                fetchCodes(s);
                                // optional: auto fetch on click
                                // setTimeout(fetchCodes, 0);
                            }}
                        >
                            {t(`list.status.${s.toLowerCase()}`)}
                        </Button>
                    ))}
                </div>
                <div className="flex gap-2">
                    {["SEARCH"].map((s) => (
                        <Button
                            key={s}
                            variant={status === s ? "default" : "secondary"}
                            onClick={() => {
                                if (keyword.length < 8) {
                                    alert(t('list.keyword.tooShort'));
                                    return;
                                }
                                setStatus(s);
                                fetchCodes(s);
                                // optional: auto fetch on click
                                // setTimeout(fetchCodes, 0);
                            }}
                        >
                            {t(`list.status.${s.toLowerCase()}`)}
                        </Button>
                    ))}
                    <Input
                        id="keyword"
                        type="text"
                        value={keyword}
                        placeholder={t('list.keyword.placeholder')}
                        onChange={(e) => setKeyword(e.target.value)}
                    />
                </div>

                <div className="bg-white border rounded-md p-4">
                    <p className="text-sm text-gray-500 mb-2">
                        {t('list.info', { status: t(`list.status.${status.toLowerCase()}`), count: codes.length })}
                    </p>
                    <Table wrapperClassName="max-h-[70vh] overflow-auto">
                        <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
                            <TableRow>
                                <TableHead>{t('list.table.uuid')}</TableHead>
                                <TableHead>{t('list.table.pin')}</TableHead>
                                <TableHead>{t('list.table.status')}</TableHead>
                                <TableHead>{t('list.table.createdAt')}</TableHead>
                                <TableHead>{t('list.table.actions')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {codes.length === 0 ? (  // there is nocodes 
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center text-gray-500">
                                        {t('list.table.noCodes')}
                                    </TableCell>
                                </TableRow>
                            ) : ( // there is some codes
                                codes.map((item: any) => (
                                    <QRCodeRow
                                        key={item.PK}
                                        item={item}
                                        apiUrl={apiUrl}
                                        onGeneratePDF={onGeneratePDF}
                                        onRefresh={fetchCodes}
                                    />
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}

function QRCodeRow({ item, apiUrl, onGeneratePDF, onRefresh }: {
    item: any;
    apiUrl: string;
    onGeneratePDF: (batch: any, paperformat: string, cardformat: string) => Promise<void>;
    onRefresh: () => void;
}) {
    const t = useTranslations('AdminPage');
    const tShop = useTranslations('ShopPage');
    const ts = useTranslations('Timestamp');
    const st = useTranslations('Status');
    const tt = useTranslations('Time');
    const [open, setOpen] = useState(false);
    const uuid = item.PK.replace('QR#', '');

    const statusColor = (
        item.status === 'UNASSIGNED' ? 'bg-gray-100' :
            item.status === 'LINKED' ? 'bg-emerald-100 text-emerald-800' :
                item.status === 'ACTIVE' ? 'bg-yellow-100 text-yellow-800' :
                    item.status === 'USED' ? 'bg-orange-100 text-orange-800' :
                        item.status === 'SHIPPED' ? 'bg-indigo-100 text-indigo-800' :
                            item.status === 'COMPLETED' ? 'bg-purple-100 text-purple-800' :
                                item.status === 'EXPIRED' ? 'bg-gray-100 text-gray-800' :
                                    item.status === 'BANNED' ? 'bg-red-100 text-red-800' :
                                        'bg-green-100 text-green-800'
    );

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <TableRow className="cursor-pointer hover:bg-gray-100">
                    <TableCell className="font-mono text-xs select-all">
                        {uuid}
                    </TableCell>
                    <TableCell className="font-mono text-xs select-all">
                        {item.pin}
                    </TableCell>
                    <TableCell>
                        <span className={`px-2 py-1 rounded text-xs ${statusColor}`}>
                            {st(item.status ? item.status.toLowerCase() : 'active')}
                        </span>
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                        {item.ts_updated_at ? new Date(item.ts_updated_at).toLocaleString() : '-'}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                            variant="outline"
                            size="sm"
                            className="mr-2 h-6 text-xs"
                            onClick={(e) => {
                                e.stopPropagation();
                                onGeneratePDF({
                                    id: uuid,
                                    codes: [{ uuid, pin: item.pin }]
                                }, PDF_PAPER_FORMAT, PDF_CARD_FORMAT);
                            }}
                        >
                            {t('list.ban.pdf')}
                        </Button>
                        {item.status !== 'BANNED' && (
                            <BanButton uuid={uuid} apiUrl={apiUrl} onSuccess={onRefresh} />
                        )}
                    </TableCell>
                </TableRow>
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{tShop('orders.details')}</DialogTitle>
                    <DialogDescription asChild>
                        <div className="font-mono text-sm text-gray-500 w-full flex flex-col gap-0 text-left mt-4">
                            <div className="flex items-center gap-2">
                                ID: {uuid}
                                <Copy className="cursor-pointer w-4 h-4" onClick={() => navigator.clipboard.writeText(uuid)} />
                                <ExternalLink className="cursor-pointer w-4 h-4" onClick={() => window.open(`${NEXT_PUBLIC_APP_URL}/receive/${uuid}`, '_blank')} />
                            </div>
                            <div className="flex items-center gap-2">
                                PIN: {item.pin}
                                <Copy className="cursor-pointer w-4 h-4" onClick={() => navigator.clipboard.writeText(item.pin)} />
                            </div>
                        </div>
                    </DialogDescription>
                </DialogHeader>

                {/* ダイアログが開いている間だけ中身をレンダリング */}
                {open && (
                    <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto">
                        {/* Product Info */}
                        <div>
                            <h4 className="text-sm font-semibold text-gray-500">{tShop('orders.productName')}</h4>
                            <p className="font-medium">{item.product_name || item.product_id || '-'}</p>
                        </div>

                        {/* Shop Info */}
                        <div>
                            <h4 className="text-sm font-semibold text-gray-500">{t('shopInfo.title')}</h4>
                            <div className="text-sm mt-1 grid grid-cols-[80px_1fr] gap-x-2 gap-y-1">
                                <span className="text-gray-400 text-xs">{t('shopInfo.name')}</span>
                                <span className="font-medium">{item.shop_name || '-'}</span>

                                <span className="text-gray-400 text-xs">{t('shopInfo.id')}</span>
                                <span className="font-mono text-xs text-gray-600">{item.shop_id || '-'}</span>

                                <span className="text-gray-400 text-xs">{t('shopInfo.contact')}</span>
                                <span className="text-gray-600 break-all">{item.shop_email || '-'}</span>
                            </div>
                        </div>

                        {/* Status */}
                        <div>
                            <h4 className="text-sm font-semibold text-gray-500">{tShop('orders.status')}</h4>
                            <span className={`px-2 py-1 rounded text-xs ${statusColor}`}>
                                {st(item.status ? item.status.toLowerCase() : 'active')}
                            </span>
                        </div>

                        {/* Recipient Info */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <h4 className="text-sm font-semibold text-gray-500">{tShop('orders.recipient')}</h4>
                                <p>{item.recipient_name || '-'}</p>
                            </div>
                            <div>
                                <h4 className="text-sm font-semibold text-gray-500">{tShop('orders.contact')}</h4>
                                <p className="break-all">{item.shipping_info?.email || '-'}</p>
                                <p className="text-sm mt-1">{item.shipping_info?.phone || '-'}</p>
                            </div>
                        </div>

                        <div>
                            <h4 className="text-sm font-semibold text-gray-500">{tShop('orders.address')}</h4>
                            {item.postal_code && <p className="text-sm">〒{item.postal_code}</p>}
                            <p className="whitespace-pre-wrap text-sm">{item.address || '-'}</p>
                        </div>

                        <div>
                            <h4 className="text-sm font-semibold text-gray-500">{tShop('orders.preferredDateTime')}</h4>
                            <p className="text-sm">{item.preferred_date ? item.preferred_date : '-'}  /  {item.preferred_time ? tt(item.preferred_time) : '-'}</p>
                        </div>

                        {/* Order Info */}
                        <div className="pt-2 space-y-4">
                            {item.memo_for_users && (
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-500">{tShop('orders.userMessage')}</h4>
                                    <p className="text-sm bg-gray-50 p-2 rounded">{item.memo_for_users}</p>
                                </div>
                            )}
                            {item.memo_for_shop && (
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-500">{tShop('orders.shopMemo')}</h4>
                                    <p className="text-sm bg-orange-50 p-2 rounded">{item.memo_for_shop}</p>
                                </div>
                            )}
                            <div>
                                <h4 className="text-sm font-semibold text-gray-500">{tShop('orders.shipDialog.deliveryCompany')}</h4>
                                <p className="font-mono">{item.delivery_company || '-'}</p>
                            </div>
                            <div>
                                <h4 className="text-sm font-semibold text-gray-500">{tShop('orders.shipDialog.label')}</h4>
                                <p className="font-mono">{item.tracking_number || '-'}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <h4 className="text-sm font-semibold text-gray-500">{tShop('orders.timestamps')}</h4>
                                <p className="text-sm">{ts('ts_updated_at') + ": " + (item.ts_updated_at ? new Date(item.ts_updated_at).toLocaleString() : "-")}</p>
                                <p className="text-sm">{ts('ts_linked_at') + ": " + (item.ts_linked_at ? new Date(item.ts_linked_at).toLocaleString() : "-")}</p>
                                <p className="text-sm">{ts('ts_activated_at') + ": " + (item.ts_activated_at ? new Date(item.ts_activated_at).toLocaleString() : "-")}</p>
                                <p className="text-sm">{ts('ts_submitted_at') + ": " + (item.ts_submitted_at ? new Date(item.ts_submitted_at).toLocaleString() : "-")}</p>
                                <p className="text-sm">{ts('ts_shipped_at') + ": " + (item.ts_shipped_at ? new Date(item.ts_shipped_at).toLocaleString() : "-")}</p>
                                <p className="text-sm">{ts('ts_completed_at') + ": " + (item.ts_completed_at ? new Date(item.ts_completed_at).toLocaleString() : "-")}</p>
                                <p className="text-sm">{ts('ts_expired_at') + ": " + (item.ts_expired_at ? new Date(item.ts_expired_at).toLocaleString() : "-")}</p>
                                <p className="text-sm">{ts('ts_banned_at') + ": " + (item.ts_banned_at ? new Date(item.ts_banned_at).toLocaleString() : "-")}</p>
                            </div>
                        </div>

                        {/* 生データ */}
                        <div className="mt-4">
                            <h4 className="text-sm font-semibold text-gray-500 border-b mb-2">{t('list.raw')}</h4>
                            {Object.entries(item).map(([key, value]) => {
                                if (key === 'shipping_info' || key.startsWith('ts_')) return null;
                                if (key.startsWith('GSI') || key === "SK" || key === "PK") return null;
                                return (
                                    <div key={key} className="grid grid-cols-2 gap-1">
                                        <h4 className="text-sm font-semibold text-gray-500">{key}</h4>
                                        <p className="text-sm">
                                            {value == null
                                                ? '-'
                                                : typeof value === 'object'
                                                    ? JSON.stringify(value)
                                                    : String(value)}
                                        </p>
                                    </div>
                                );
                            })}
                            <div className="mt-0 border-t" />
                            {item.shipping_info && Object.entries(item.shipping_info).map(([key, value]) => (
                                <div key={`shipping_${key}`} className="grid grid-cols-2 gap-1">
                                    <h4 className="text-sm font-semibold text-gray-500">{key}</h4>
                                    <p className="text-sm">
                                        {value == null
                                            ? '-'
                                            : typeof value === 'object'
                                                ? JSON.stringify(value)
                                                : String(value)}
                                    </p>
                                </div>
                            ))}
                            <div className="mt-0 border-t" />
                            {Object.entries(item).map(([key, value]) => {
                                if (!key.startsWith('ts_')) return null;
                                return (
                                    <div key={key} className="grid grid-cols-2 gap-1">
                                        <h4 className="text-sm font-semibold text-gray-500">{key}</h4>
                                        <p className="text-sm">
                                            {value == null
                                                ? '-'
                                                : typeof value === 'object'
                                                    ? JSON.stringify(value)
                                                    : String(value)}
                                        </p>
                                    </div>
                                );
                            })}
                            <div className="mt-0 border-t" />
                            {Object.entries(item).map(([key, value]) => {
                                if (!key.startsWith('GSI') && key !== "SK" && key !== "PK") return null;
                                return (
                                    <div key={key} className="grid grid-cols-2 gap-1">
                                        <h4 className="text-sm font-semibold text-gray-500">{key}</h4>
                                        <p className="text-sm">
                                            {value == null
                                                ? '-'
                                                : typeof value === 'object'
                                                    ? JSON.stringify(value)
                                                    : String(value)}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

function BanButton({ uuid, apiUrl, onSuccess }: { uuid: string, apiUrl: string, onSuccess: () => void }) {
    const t = useTranslations('AdminPage');
    const [loading, setLoading] = useState(false);

    const handleBan = async () => {
        if (!confirm(t('list.ban.confirm'))) return;
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
                alert(t('list.ban.failed'));
            }
        } catch (e) {
            // console.error(e);
            alert(t('list.ban.error'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Button variant="destructive" size="sm" onClick={(e) => { e.stopPropagation(); handleBan(); }} disabled={loading} className="h-6 text-xs bg-red-600 hover:bg-red-700">
            {loading ? '...' : t('list.ban.button')}
        </Button>
    );
}