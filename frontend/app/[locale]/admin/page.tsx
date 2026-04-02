/**
 * ファイル概要: システム管理者向けダッシュボード
 * 目的: QRコードのバッチ生成機能や生成履歴の確認、およびQRコードの個別ステータス管理やBAN処理を行います。
 */
"use client";

import { useState, useEffect, useRef } from "react";
import { notFound, useParams } from "next/navigation";
import { getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { APP_CONFIG } from "@/lib/config";
import { generateId } from '@/lib/id';
import { useTranslations } from 'next-intl';
import { generatePDF } from '@/lib/generatePDF';
import { cardformats, paperformats } from '@/lib/constants/designs';
import { generateCSVExport } from '@/lib/generateCSVExport';
import { ExternalLink, Copy, Check, Eye, QrCode, Store, Wrench, Layers, HelpCircle, Home, Trash2, RotateCcw, Loader2, Plus, X, Search, Save, FileText, Download, CreditCard, Printer, Paintbrush, ChevronDown, Settings } from 'lucide-react';
import CardDesignEditor from "@/components/admin/CardDesignEditor";
const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";
// const PDF_PAPER_FORMAT = "10S31251"; //"1S31034"
// const PDF_CARD_FORMAT = "gakuchousenbeiv1"; //"gakuchousenbeiv0"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Link, useRouter } from '@/i18n/routing';
import { Textarea } from "@/components/ui/textarea";

import { adminApi } from "@/lib/api/admin";

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
    const [paperFormat, setPaperFormat] = useState("10S31251");
    const [cardFormat, setCardFormat] = useState("gakuchousenbeiv1");
    const [dbCardDesigns, setDbCardDesigns] = useState<any[]>([]);
    const [reloadDbCardDesigns, setReloadDbCardDesigns] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isExportingCsv, setIsExportingCsv] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState("qrcodes");
    const [cardOrders, setCardOrders] = useState<any[]>([]);
    const [cardOrdersLoading, setCardOrdersLoading] = useState(false);
    const [cardOrderFilterStatus, setCardOrderFilterStatus] = useState("ORDERED");
    const [cardOrderFilterShopId, setCardOrderFilterShopId] = useState("");
    const router = useRouter();
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const handleCopy = (id: string) => {
        navigator.clipboard.writeText(id).then(() => {
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        });
    };

    const fetchDbCardDesigns = async () => {
        try {
            const data = await adminApi.admin_carddesigns_list({});
            setDbCardDesigns(data.items || []);
        } catch (e) {
            // console.error("Failed to fetch designs", e);
        }
    };

    useEffect(() => {
        if (reloadDbCardDesigns && (activeTab === "qrcodes" || activeTab === "cardorders")) {
            fetchDbCardDesigns();
            setReloadDbCardDesigns(false);
        }
        if (activeTab === "designs") {
            setReloadDbCardDesigns(true);
        }
        if (activeTab === "cardorders") {
            fetchCardOrders();
        }
    }, [activeTab, reloadDbCardDesigns, cardOrderFilterStatus]);

    const fetchCardOrders = async () => {
        setCardOrdersLoading(true);
        try {
            const data = await adminApi.admin_card_orders_list({
                status: cardOrderFilterStatus,
                limit: 50
            });
            setCardOrders(data.items || []);
        } catch (e) {
            console.error("Failed to fetch card orders", e);
        } finally {
            setCardOrdersLoading(false);
        }
    };

    const handleUpdateCardOrderStatus = async (shopId: string, orderId: string, status: string) => {
        try {
            await adminApi.admin_card_orders_update({
                shop_id: shopId,
                order_id: orderId,
                status
            });
            fetchCardOrders();
        } catch (e) {
            alert(tb('Internal Server Error'));
        }
    };

    //Note: Authentication check is now handled by AdminLayout







    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            const resolveDesign = (designId?: string) => {
                const targetId = designId || cardFormat;
                const dbDesign = dbCardDesigns.find(d => d.design_id === targetId);
                if (dbDesign) return dbDesign;
                if (cardformats[targetId]) return targetId;
                // Fallback to currently selected global design
                const globalDesign = dbCardDesigns.find(d => d.design_id === cardFormat);
                return globalDesign || cardFormat;
            };

            const data = await adminApi.admin_qr_generate({
                count,
                ...(useMetadataOptions ? {
                    shop_id: shopId || undefined,
                    product_id: productId || undefined,
                    owner_user_id: ownerUuid || undefined,
                    sender_id: senderId || undefined,
                    expiry_date: expiryDate ? new Date(expiryDate).toISOString() : undefined,
                    activate_now: activateNow
                } : {}),
                card_design: cardFormat
            });

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

            // Automatically download PDF and CSV
            const design = resolveDesign(cardFormat);
            await generatePDF(newBatch, paperFormat, design);
            await generateCSVExport(newBatch, design);
        } catch (e: any) {
            const errData = e;
            alert((tb(errData?.message?.replace(/\./g, '_')) || errData?.message) || t('batches.alerts.failed') + (errData?.detail?.toString() || ''));
        } finally {
            setIsGenerating(false);
        }
    };



    return (
        <div className="min-h-screen bg-mist-900 p-3 sm:p-8 text-white overflow-x-hidden"> {/* bg-[#383838] */}
            <div className="w-full max-w-[1600px] mx-auto space-y-6 overflow-x-hidden">
                <div className="flex justify-between items-center flex-wrap gap-4">
                    <h1 className="text-2xl font-bold text-white w-full sm:w-auto text-center sm:text-left">{t('title')}</h1>
                    <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-end w-full sm:w-auto">
                        <Link href="/admin/help/overview">
                            <Button variant="outline" className="bg-mist-800 border-mist-700 text-mist-300 hover:bg-mist-700 hover:text-white transition-all duration-300">
                                <HelpCircle className="w-4 h-4 mr-2" />
                                {t('helpButton') || "Help"}
                            </Button>
                        </Link>
                        {/* <Link href="/login" className="w-full sm:w-auto">
                            <Button variant="destructive" className="shadow-md cursor-pointer border border-red-900 w-full sm:w-auto">
                                {t('qrAdminLoginPage')}
                            </Button>
                        </Link> */}

                        <Button variant="ghost" className="text-mist-500 hover:text-mist-800" onClick={() => router.push('/login')}>
                            <ChevronDown className="h-4 w-4 mr-1 rotate-90" /> {t('back')}
                        </Button>
                    </div>
                </div>


                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
                    <button
                        onClick={() => setActiveTab("qrcodes")}
                        className={cn(
                            "flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md",
                            activeTab === "qrcodes"
                                ? "bg-white border-white text-mist-900 ring-2 ring-mist-700 ring-offset-2 ring-offset-mist-900"
                                : "bg-mist-800 border-mist-700 text-mist-300 hover:border-mist-600 hover:bg-mist-700/50"
                        )}
                    >
                        <CreditCard className={cn("w-12 h-12 mb-3", activeTab === "qrcodes" ? "text-mist-900" : "text-mist-400")} />
                        <span className="text-lg font-bold">{t('tabs.qrcodes')}</span>
                    </button>
                    <button
                        onClick={() => setActiveTab("cardorders")}
                        className={cn(
                            "flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md",
                            activeTab === "cardorders"
                                ? "bg-white border-white text-mist-900 ring-2 ring-mist-700 ring-offset-2 ring-offset-mist-900"
                                : "bg-mist-800 border-mist-700 text-mist-300 hover:border-mist-600 hover:bg-mist-700/50"
                        )}
                    >
                        <Printer className={cn("w-12 h-12 mb-3", activeTab === "cardorders" ? "text-mist-900" : "text-mist-400")} />
                        <span className="text-lg font-bold">{t('tabs.cardorders')}</span>
                    </button>
                    <button
                        onClick={() => setActiveTab("designs")}
                        className={cn(
                            "flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md",
                            activeTab === "designs"
                                ? "bg-white border-white text-mist-900 ring-2 ring-mist-700 ring-offset-2 ring-offset-mist-900"
                                : "bg-mist-800 border-mist-700 text-mist-300 hover:border-mist-600 hover:bg-mist-700/50"
                        )}
                    >
                        <Paintbrush className={cn("w-12 h-12 mb-3", activeTab === "designs" ? "text-mist-900" : "text-mist-400")} />
                        <span className="text-lg font-bold">{t('tabs.designs')}</span>
                    </button>
                    <button
                        onClick={() => setActiveTab("shops")}
                        className={cn(
                            "flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md",
                            activeTab === "shops"
                                ? "bg-white border-white text-mist-900 ring-2 ring-mist-700 ring-offset-2 ring-offset-mist-900"
                                : "bg-mist-800 border-mist-700 text-mist-300 hover:border-mist-600 hover:bg-mist-700/50"
                        )}
                    >
                        <Store className={cn("w-12 h-12 mb-3", activeTab === "shops" ? "text-mist-900" : "text-mist-400")} />
                        <span className="text-lg font-bold">{t('tabs.shops')}</span>
                    </button>
                    <button
                        onClick={() => setActiveTab("tools")}
                        className={cn(
                            "flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md",
                            activeTab === "tools"
                                ? "bg-white border-white text-mist-900 ring-2 ring-mist-700 ring-offset-2 ring-offset-mist-900"
                                : "bg-mist-800 border-mist-700 text-mist-300 hover:border-mist-600 hover:bg-mist-700/50"
                        )}
                    >
                        <Wrench className={cn("w-12 h-12 mb-3", activeTab === "tools" ? "text-mist-900" : "text-mist-400")} />
                        <span className="text-lg font-bold">{t('tabs.tools')}</span>
                    </button>
                </div>





                {activeTab === "qrcodes" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">


                        {/* すべてのQRコード一覧 */}
                        <QRCodeListSection
                            apiUrl={NEXT_PUBLIC_API_URL}
                            onGeneratePDF={generatePDF}
                            paperFormat={paperFormat}
                            cardFormat={cardFormat}
                            dbCardDesigns={dbCardDesigns}
                        />
                    </div>
                )}





                {activeTab === "cardorders" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">

                        <Card>
                            <CardHeader className="flex flex-row items-center gap-2">
                                <Settings />
                                <CardTitle>Config</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex flex-col w-full gap-1 ">
                                    <label className="mt-4 w-full flex  items-center text-[11px] sm:text-xs text-gray-700 font-medium">{t('generate.paperFormat')}</label>
                                    <select
                                        className="w-full rounded-md p-2 text-sm border border-gray-200 shadow-sm text-black bg-white"
                                        value={paperFormat}
                                        onChange={(e) => setPaperFormat(e.target.value)}
                                    >
                                        {Object.entries(paperformats).map(([key, value]: [string, any]) => (
                                            <option key={key} value={key}>{value.description || key}</option>
                                        ))}
                                    </select>
                                </div>
                            </CardContent>
                        </Card>


                        <CardOrderListSection
                            orders={cardOrders}
                            loading={cardOrdersLoading}
                            statusFilter={cardOrderFilterStatus}
                            setStatusFilter={setCardOrderFilterStatus}
                            shopIdFilter={cardOrderFilterShopId}
                            setShopIdFilter={setCardOrderFilterShopId}
                            onUpdateStatus={handleUpdateCardOrderStatus}
                            onRefresh={fetchCardOrders}
                            dbCardDesigns={dbCardDesigns}
                            paperFormat={paperFormat}
                            cardFormat={cardFormat}
                        />
                        {/* QRコード生成 */}
                        <Card>
                            <CardHeader>
                                <CardTitle>{t('generate.title')}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex flex-col w-full gap-1.5">
                                    <div className="grid w-full items-center gap-1.5">
                                        <label htmlFor="count" className="text-lg font-bold mt-4">1. {t('generate.quantity')}</label>
                                        <Input
                                            id="count"
                                            type="number"
                                            value={count}
                                            onChange={(e) => setCount(Number(e.target.value))}
                                        />
                                    </div>

                                    <h3 className="text-lg font-bold mt-4">2. {t('generate.pdfOptions')}</h3>
                                    <div className="space-y-4 rounded-xl bg-gray-100 border border-gray-200 border-dashed border-5 p-3 sm:p-4">
                                        <div className="flex flex-col gap-3">

                                            <div className="flex flex-col sm:flex-row w-full gap-1">
                                                <label className="flex w-full sm:w-24 items-center text-[11px] sm:text-xs text-gray-700 font-medium">{t('generate.cardFormat')}</label>
                                                <select
                                                    className="flex-1 min-w-0 w-full rounded-md p-2 text-sm border border-gray-200 shadow-sm text-black bg-white"
                                                    value={cardFormat}
                                                    onChange={(e) => setCardFormat(e.target.value)}
                                                >
                                                    {Object.entries(cardformats).map(([key, value]: [string, any]) => (
                                                        <option key={key} value={key}>{value.name || key} [System]</option>
                                                    ))}
                                                    {dbCardDesigns.map((d: any) => (
                                                        <option key={d.design_id} value={d.design_id}>{d.name || d.design_id} [DB]</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        {/* Card Preview */}
                                        <div className="w-full overflow-hidden">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div className="space-y-1 w-full">
                                                    <div className="aspect-[84/52] w-full relative rounded shadow-lg overflow-hidden border border-gray-700 bg-white">
                                                        <img
                                                            src={(dbCardDesigns.find(d => d.design_id === cardFormat)?.thumbf || dbCardDesigns.find(d => d.design_id === cardFormat)?.bgimgf) || cardformats[cardFormat]?.bgimgf}
                                                            alt={t('generate.frontPreview')}
                                                            className="absolute inset-0 w-full h-full object-cover"
                                                            crossOrigin="anonymous"
                                                        />
                                                    </div>
                                                    <p className="text-[10px] text-gray-500 text-center uppercase tracking-wider">{t('generate.front')}</p>
                                                </div>
                                                <div className="space-y-1 w-full">
                                                    <div className="aspect-[84/52] w-full relative rounded shadow-lg overflow-hidden border border-gray-700 bg-white">
                                                        <img
                                                            src={(dbCardDesigns.find(d => d.design_id === cardFormat)?.thumbb || dbCardDesigns.find(d => d.design_id === cardFormat)?.bgimgb) || cardformats[cardFormat]?.bgimgb}
                                                            alt={t('generate.backPreview')}
                                                            className="absolute inset-0 w-full h-full object-cover"
                                                            crossOrigin="anonymous"
                                                        />
                                                    </div>
                                                    <p className="text-[10px] text-gray-500 text-center uppercase tracking-wider">{t('generate.back')}</p>
                                                </div>
                                            </div>
                                        </div>


                                    </div>


                                    <label htmlFor="shopId" className="text-lg font-bold mt-4">3. {t('generate.option')}</label>
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            id="useMetadataOptions"
                                            checked={useMetadataOptions}
                                            onCheckedChange={(checked: boolean) => setUseMetadataOptions(checked)}
                                        />
                                        <Label htmlFor="useMetadataOptions" className="text-sm font-medium cursor-pointer">
                                            {t('generate.useMetadata')}
                                        </Label>
                                    </div>

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
                                                placeholder=""
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
                                                placeholder=""
                                                onChange={(e) => setProductId(e.target.value)}
                                            />
                                        </div>
                                        <div className="grid w-full items-center gap-1.5">
                                            <div className="flex items-center gap-2">
                                                <div className={cn("w-3 h-3 rounded-full items-center justify-center", ownerUuid ? "bg-red-500" : "bg-gray-500")}></div>
                                                <label htmlFor="ownerUuid" className="text-sm font-medium">{t('generate.ownerUserId')}</label>
                                            </div>
                                            <Input
                                                id="ownerUuid"
                                                type="text"
                                                value={ownerUuid}
                                                placeholder=""
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
                                                placeholder=""
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
                                            className="w-full items-center gap-1.5 h-24"
                                            disabled={isGenerating}
                                        >
                                            {isGenerating ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                                    {t('generate.button')}...
                                                </>
                                            ) : (
                                                t('generate.button')
                                            )}
                                        </Button>
                                    </div>

                                </div>
                            </CardContent>
                            {/* このページを開いてから生成したQRコードのバッチ一覧 */}
                            <CardFooter className="border-t">


                                <div className="space-y-4 w-full">
                                    <CardTitle>{t('batches.title')}</CardTitle>
                                    {generatedBatches.length === 0 ? <p className="text-gray-500">{t('batches.noBatches')}</p> : (
                                        generatedBatches.map(batch => (
                                            <div key={batch.id} className="bg-white border p-4 rounded-md">
                                                <div className="flex flex-wrap items-center mb-2">
                                                    <div className="flex gap-2 flex-wrap flex-rows items-center">
                                                        <div>
                                                            <div className="flex items-center gap-1">
                                                                <p className="font-medium">{t('batches.batchId', { id: batch.id })}</p>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-4 w-4"
                                                                    onClick={() => handleCopy(batch.id)}
                                                                >
                                                                    {copiedId === batch.id ? (
                                                                        <Check className="h-3 w-3 text-green-500" />
                                                                    ) : (
                                                                        <Copy className="h-3 w-3" />
                                                                    )}
                                                                </Button>
                                                            </div>
                                                            <p className="text-sm text-gray-500">{t('batches.info', { count: batch.count, date: batch.date })}</p>
                                                        </div>
                                                        <p className="flex justify-center items-center text-sm bg-green-100 text-green-800 px-3 py-1 rounded-xl">{batch.status}</p>
                                                    </div>
                                                    <Button className="ml-auto" variant="outline" size="sm" onClick={() => {
                                                        setIsExportingCsv(batch.id);
                                                        try {
                                                            const resolveDesign = (designId?: string) => {
                                                                const targetId = designId || cardFormat;
                                                                const dbDesign = dbCardDesigns.find(d => d.design_id === targetId);
                                                                if (dbDesign) return dbDesign;
                                                                if (cardformats[targetId]) return targetId;
                                                                const globalDesign = dbCardDesigns.find(d => d.design_id === cardFormat);
                                                                return globalDesign || cardFormat;
                                                            };
                                                            const design = resolveDesign(batch.card_design);
                                                            generatePDF(batch, paperFormat, design);
                                                        } finally {
                                                            setIsExportingCsv(null);
                                                        }
                                                    }}>
                                                        {isExportingCsv === batch.id ? (
                                                            <>
                                                                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                                                {t('batches.downloading')}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <FileText className="w-4 h-4 mr-2" />
                                                                {t('batches.downloadPdf')}
                                                            </>
                                                        )}
                                                    </Button>
                                                    <Button className="ml-2" variant="outline" size="sm" disabled={isExportingCsv === batch.id} onClick={async () => {
                                                        setIsExportingCsv(batch.id);
                                                        try {
                                                            const resolveDesign = (designId?: string) => {
                                                                const targetId = designId || cardFormat;
                                                                const dbDesign = dbCardDesigns.find(d => d.design_id === targetId);
                                                                if (dbDesign) return dbDesign;
                                                                if (cardformats[targetId]) return targetId;
                                                                const globalDesign = dbCardDesigns.find(d => d.design_id === cardFormat);
                                                                return globalDesign || cardFormat;
                                                            };
                                                            const design = resolveDesign(batch.card_design);
                                                            await generateCSVExport(batch, design);
                                                        } finally {
                                                            setIsExportingCsv(null);
                                                        }
                                                    }}>
                                                        {isExportingCsv === batch.id ? (
                                                            <>
                                                                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                                                {t('batches.downloading')}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Download className="w-4 h-4 mr-2" />
                                                                {t('batches.downloadCsv')}
                                                            </>
                                                        )}
                                                    </Button>
                                                </div>
                                                {/* Display Codes */}
                                                <div className="mt-2 bg-gray-100 p-2 rounded text-xs font-mono overflow-auto max-h-40">
                                                    <table className="w-full text-left">
                                                        <thead>
                                                            <tr>
                                                                <th>{t('batches.table.qrId')}</th>
                                                                <th>{t('batches.table.pin')}</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {batch.codes?.map((code: any) => (
                                                                <tr key={code.qrId || (code as any).uuid} className="border-b border-gray-200 last:border-0 group">
                                                                    <td className="pr-4 py-0.5 select-all text-[10px] break-all">
                                                                        <div className="flex items-center gap-1">
                                                                            {code.qrId || (code as any).uuid}
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="icon"
                                                                                className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                                onClick={() => handleCopy(code.qrId || (code as any).uuid)}
                                                                            >
                                                                                {copiedId === (code.qrId || (code as any).uuid) ? (
                                                                                    <Check className="h-2 w-2 text-green-500" />
                                                                                ) : (
                                                                                    <Copy className="h-2 w-2" />
                                                                                )}
                                                                            </Button>
                                                                        </div>
                                                                    </td>
                                                                    <td className="py-0.5 select-all text-[10px] break-all">
                                                                        <div className="flex items-center gap-1">
                                                                            {code.pin}
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="icon"
                                                                                className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                                onClick={() => handleCopy(code.pin)}
                                                                            >
                                                                                {copiedId === code.pin ? (
                                                                                    <Check className="h-2 w-2 text-green-500" />
                                                                                ) : (
                                                                                    <Copy className="h-2 w-2" />
                                                                                )}
                                                                            </Button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </CardFooter>
                        </Card>

                    </div>
                )}





                {activeTab === "shops" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* ショップのメタデータ管理 (NEW) */}
                        <AdminShopCardDesignLinkSection apiUrl={NEXT_PUBLIC_API_URL} dbCardDesigns={dbCardDesigns} />

                        {/* ショップの新規作成 (NEW) */}
                        <AdminShopCreationSection apiUrl={NEXT_PUBLIC_API_URL} />

                        {/* ショップオーナーの変更 (NEW) */}
                        <ShopOwnerChangeSection apiUrl={NEXT_PUBLIC_API_URL} />

                        {/* ショップ管理者の紐づけ (NEW) */}
                        <ManagerLinkingSection apiUrl={NEXT_PUBLIC_API_URL} />
                    </div>
                )}





                {activeTab === "tools" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* データダンプ */}
                        <DataDumpSection apiUrl={NEXT_PUBLIC_API_URL} />
                    </div>
                )}





                {activeTab === "designs" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <CardDesignEditor apiUrl={NEXT_PUBLIC_API_URL} />
                    </div>
                )}





            </div>
        </div>
    );
}

function QRCodeListSection({ apiUrl, onGeneratePDF, paperFormat, cardFormat, dbCardDesigns }: {
    apiUrl: string,
    onGeneratePDF: (batch: any, paperformat: string, cardformat: string | any) => Promise<void>,
    paperFormat: string,
    cardFormat: string,
    dbCardDesigns: any[]
}) {
    const t = useTranslations('AdminPage');
    const tShop = useTranslations('ShopPage');
    const ts = useTranslations('Timestamp');
    const st = useTranslations('Status');
    const tt = useTranslations('Time');
    const [status, setStatus] = useState("UNASSIGNED");
    const [keyword, setKeyword] = useState("");
    const [codes, setCodes] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [isDenseAuto, setIsDenseAuto] = useState(false);
    const [isDenseManual, setIsDenseManual] = useState<boolean | null>(null);
    // データ取得制限（50件）を超えてまだデータがあるかどうかを管理するフラグ
    const [hasMore, setHasMore] = useState(false);

    const isDense = isDenseManual !== null ? isDenseManual : (codes.length > 30);

    const handleExportCSV = () => {
        if (codes.length === 0) return;

        // Header for CSV
        const headers = [
            t('list.table.qrId'),
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
            const qrId = item.PK.replace('QR#', '');
            const statusLabel = st(item.status ? item.status.toLowerCase() : 'active');
            const updatedAt = item.ts_updated_at ? new Date(item.ts_updated_at).toLocaleString() : '-';
            const email = item.shipping_info?.email || '-';
            const phone = item.shipping_info?.phone || '-';
            const contact = `${email}${phone !== '-' ? ' / ' + phone : ''}`;
            const preferredDateTime = `${item.preferred_date ? item.preferred_date : '-'} / ${item.preferred_time ? tt(item.preferred_time) : '-'}`;

            return [
                qrId,
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
            // 【コスト最適化】バックエンドでの取得件数を最大50件に制限します。
            const data = await adminApi.admin_qr_list({
                status: currentStatus,
                keyword,
                limit: 50 // フロントエンドでの表示上限に合わせて50件を指定
            });
            setCodes(data.items || []);
            // 続きのデータが存在するかどうかのフラグを保存
            setHasMore(data.hasMore || false);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteAllBanned = async () => {
        if (status !== 'BANNED') return;
        if (!confirm(t('list.deleteBanned.confirm'))) return;

        setLoading(true);
        try {
            const data = await adminApi.admin_qr_deleteban({});
            alert(t('list.deleteBanned.success', { count: data.count }));
            fetchCodes(); // Refresh list
        } catch (e) {
            alert(t('list.deleteBanned.failed'));
        } finally {
            setLoading(false);
        }
    };


    return (
        <Card className="w-full">
            <CardHeader className="">
                <CardTitle className="flex flex-col sm:flex-col items-start gap-4">
                    <span className="w-full sm:w-auto text-center sm:text-left">{t('list.title')}</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 overflow-hidden">
                <div className="w-full grid grid-cols-3 gap-2">
                    <Button variant="outline" size="sm" onClick={() => setIsDenseManual(prev => prev === null ? !isDense : !prev)} className="w-full sm:w-auto">
                        {isDense ? t('list.normalView') : t('list.compactView')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={loading || codes.length === 0} className="w-full sm:w-auto">
                        {t('list.exportCsv')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => fetchCodes()} disabled={loading} className="w-full sm:w-auto">
                        {loading ? t('list.loading') : t('list.refresh')}
                    </Button>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-2 justify-center sm:justify-start items-center">
                    {["UNASSIGNED", "LINKED", "ACTIVE", "USED", "SHIPPED", "COMPLETED", "EXPIRED", "BANNED", "PROMOTION"].map((s) => (
                        <Button
                            key={s}
                            variant={status === s ? "default" : "secondary"}
                            size="sm"
                            onClick={() => {
                                setStatus(s);
                                fetchCodes(s);
                            }}
                            className="w-full sm:w-auto text-xs"
                        >
                            {t(`list.status.${s.toLowerCase()}`)}
                        </Button>
                    ))}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1 min-w-0">
                        <Input
                            id="keyword"
                            type="text"
                            value={keyword}
                            placeholder={t('list.keyword.placeholder')}
                            onChange={(e) => setKeyword(e.target.value)}
                            className="w-full"
                        />
                    </div>
                    <div className="w-full sm:w-auto">
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
                                }}
                                className="w-full px-4"
                            >
                                {t(`list.status.${s.toLowerCase()}`)}
                            </Button>
                        ))}
                    </div>
                </div>

                <div className="bg-white border rounded-md p-4 relative">
                    {/* ローディングオーバーレイ: 通信中にリスト全体をグレーアウトしてスピナーを表示 */}
                    {loading && (
                        <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-20 flex items-center justify-center rounded-md">
                            <div className="flex flex-col items-center gap-2">
                                <Loader2 className="w-8 h-8 animate-spin text-mist-600" />
                                <p className="text-sm font-medium text-mist-900">{t('list.loading')}</p>
                            </div>
                        </div>
                    )}
                    <p className="text-sm text-gray-500 mb-2">
                        {/* 50件を超えてデータがある場合は「50+ 件」のように表示してユーザーに伝えます */}
                        {t('list.info', {
                            status: t(`list.status.${status.toLowerCase()}`),
                            count: hasMore ? `${codes.length}+` : codes.length
                        })}
                    </p>
                    <Table wrapperClassName="h-[70vh] overflow-auto" className="w-full table-fixed">
                        <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
                            <TableRow className={isDense ? "h-6" : "h-10"}>
                                <TableHead className={cn("py-1 ", isDense ? "w-[90px] h-6 px-1 text-[9px]" : "w-[120px] h-8 px-2")}>{t('list.table.createdAt')}</TableHead>
                                <TableHead className={cn("py-1 text-center", isDense ? "w-[100px] h-6 px-1 text-[9px]" : "w-[120px] h-8 px-2")}>{t('list.table.status')}</TableHead>
                                <TableHead className={cn("py-1 w-[90px] text-center hidden sm:table-cell", isDense ? "h-6 px-1 text-[9px]" : "h-8 px-2")}>{t('list.table.pin')}</TableHead>
                                <TableHead className={cn("py-1 min-w-[110px] break-all", isDense ? "h-6 px-1 text-[9px]" : "h-8 px-2")}>{t('list.table.qrIdLabel')}</TableHead>
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
                                        paperFormat={paperFormat}
                                        cardFormat={cardFormat}
                                        dbCardDesigns={dbCardDesigns}
                                        isDense={isDense}
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

function QRCodeRow({ item, apiUrl, onGeneratePDF, onRefresh, paperFormat, cardFormat, dbCardDesigns, isDense }: {
    item: any;
    apiUrl: string;
    onGeneratePDF: (batch: any, paperformat: string, cardformat: string | any, fillall: boolean) => Promise<void>;
    onRefresh: (targetStatus?: string) => Promise<void>;
    paperFormat: string;
    cardFormat: string;
    dbCardDesigns: any[];
    isDense: boolean;
}) {
    const t = useTranslations('AdminPage');
    const tShop = useTranslations('ShopPage');
    const ts = useTranslations('Timestamp');
    const st = useTranslations('Status');
    const tt = useTranslations('Time');
    const params = useParams();
    const locale = params?.locale as string;
    const [open, setOpen] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const handleCopy = (id: string) => {
        navigator.clipboard.writeText(id).then(() => {
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        });
    };

    const qrId = item.PK.replace('QR#', '');

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
                <TableRow className={cn("cursor-pointer hover:bg-gray-100", isDense ? "h-6" : "h-10")}>
                    <TableCell className={cn("text-gray-500 py-0", isDense ? "text-[9px] px-1" : "text-[12px] px-2")}>
                        {item.ts_updated_at ? new Date(item.ts_updated_at).toLocaleString() : '-'}
                    </TableCell>
                    <TableCell className="py-0 px-2">
                        <span className={cn("px-2 py-0 rounded text-center block", isDense ? "text-[10px]" : "text-[13px]", statusColor)}>
                            {st(item.status ? item.status.toLowerCase() : 'active')}
                        </span>
                    </TableCell>
                    <TableCell className={cn("font-mono select-all py-0 text-center hidden sm:table-cell", isDense ? "text-[10px] px-2" : "text-xs px-4")}>
                        {item.pin}
                    </TableCell>
                    <TableCell className={cn("font-mono select-all py-0 min-w-[110px] break-all", isDense ? "text-[9px] px-1" : "text-[11px] px-2")}>
                        {qrId}
                    </TableCell>
                </TableRow>
            </DialogTrigger>
            <DialogContent className="max-w-[80vw] sm:max-w-[70vw] lg:max-w-5xl overflow-hidden flex flex-col h-full max-h-[85vh] min-h-[400px] p-0">
                <DialogHeader className="shrink-0 border-b p-6">
                    <DialogTitle>{tShop('orders.details')}</DialogTitle>
                    <DialogDescription asChild>
                        <div className="font-mono text-sm text-gray-500 w-full flex flex-col gap-0 text-left mt-4 text-center sm:text-left">
                            <div className="flex items-center gap-2">
                                {t('list.table.qrIdLabel')}:
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => handleCopy(qrId)}
                                >
                                    {copiedId === qrId ? (
                                        <Check className="h-3 w-3 text-green-500" />
                                    ) : (
                                        <Copy className="h-3 w-3" />
                                    )}
                                </Button>
                                <ExternalLink className="cursor-pointer w-4 h-4 shrink-0" onClick={() => window.open(`/${locale}/receive/${qrId}`, '_blank')} />
                                {qrId}
                            </div>
                            <div className="flex items-center gap-2">
                                PIN:
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => handleCopy(item.pin)}
                                >
                                    {copiedId === item.pin ? (
                                        <Check className="h-3 w-3 text-green-500" />
                                    ) : (
                                        <Copy className="h-3 w-3" />
                                    )}
                                </Button>
                                {item.pin}
                            </div>
                        </div>
                    </DialogDescription>
                </DialogHeader>

                {/* ダイアログが開いている間だけ中身をレンダリング */}
                {open && (
                    <div className="flex-1 overflow-y-auto space-y-6 p-6">


                        {/* Shop Info */}
                        <div>
                            <h4 className="text-sm font-semibold text-gray-500">{t('shopInfo.title')}</h4>
                            <div className="text-sm mt-1 grid grid-cols-[80px_1fr] gap-x-2 gap-y-1">
                                <span className="text-gray-400 text-xs">{t('shopInfo.name')}</span>
                                <span className="font-medium">{item.shop_name || '-'}</span>

                                <span className="text-gray-400 text-xs">{t('shopInfo.id')}</span>
                                <div className="flex items-center gap-1 overflow-hidden">
                                    <span className="font-mono text-xs text-gray-600 truncate">{item.shop_id || '-'}</span>
                                    {item.shop_id && (
                                        <>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-4 w-4"
                                                onClick={() => handleCopy(item.shop_id)}
                                            >
                                                {copiedId === item.shop_id ? (
                                                    <Check className="h-3 w-3 text-green-500" />
                                                ) : (
                                                    <Copy className="h-3 w-3" />
                                                )}
                                            </Button>
                                            <Link href={`/shop/${item.shop_id}`}>
                                                <ExternalLink className="w-3 h-3 text-mist-500 hover:text-mist-900 cursor-pointer shrink-0" />
                                            </Link>
                                        </>
                                    )}
                                </div>

                                <span className="text-gray-400 text-xs">{t('shopInfo.contact')}</span>
                                <span className="text-gray-600 break-all">{item.shop_email || '-'}</span>
                                <span className="text-gray-400 text-xs">{tShop('orders.productName')}</span>
                                <span className="text-gray-600 break-all">{item.product_name || item.product_id || '-'}</span>
                            </div>
                        </div>

                        {/* Status */}
                        <div>
                            <h4 className="text-sm font-semibold text-gray-500">{tShop('orders.status')}</h4>
                            <span className={`px-2 py-1 rounded text-xs ${statusColor}`}>
                                {st(item.status ? item.status.toLowerCase() : 'active')}
                            </span>
                        </div>

                        {/* Card Design */}
                        {item.card_design && (
                            <div className="space-y-2">
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-500">{t('generate.cardFormat')}</h4>
                                    <p className="text-sm font-medium">{item.card_design}</p>
                                </div>
                                {(item.thumbf || item.thumbb || cardformats[item.card_design]) && (
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <div className="aspect-[84/52] relative rounded shadow-sm overflow-hidden border border-gray-100 bg-white">
                                                <img
                                                    src={item.thumbf || dbCardDesigns.find(d => d.design_id === item.card_design)?.thumbf || dbCardDesigns.find(d => d.design_id === item.card_design)?.bgimgf || cardformats[item.card_design]?.bgimgf}
                                                    alt="Front"
                                                    className="w-full h-full object-cover"
                                                    crossOrigin="anonymous"
                                                />
                                            </div>
                                            <p className="text-[9px] text-gray-400 text-center uppercase tracking-tighter">{t('generate.front')}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="aspect-[84/52] relative rounded shadow-sm overflow-hidden border border-gray-100 bg-white">
                                                <img
                                                    src={item.thumbb || dbCardDesigns.find(d => d.design_id === item.card_design)?.thumbb || dbCardDesigns.find(d => d.design_id === item.card_design)?.bgimgb || cardformats[item.card_design]?.bgimgb}
                                                    alt="Back"
                                                    className="w-full h-full object-cover"
                                                    crossOrigin="anonymous"
                                                />
                                            </div>
                                            <p className="text-[9px] text-gray-400 text-center uppercase tracking-tighter">{t('generate.back')}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

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
                <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-2 border-t p-6 shrink-0 bg-gray-50/50">
                    <div className="flex flex-wrap gap-2 flex-1 sm:flex-none">
                        <Button
                            variant="outline"
                            size="default"
                            className="flex-1 sm:flex-none h-10"
                            onClick={(e) => {
                                e.stopPropagation();
                                const resolveDesign = (designId?: string) => {
                                    const targetId = item.card_design || cardFormat;
                                    const dbDesign = dbCardDesigns.find(d => d.design_id === targetId);
                                    if (dbDesign) return dbDesign;
                                    if (cardformats[targetId]) return targetId;
                                    const globalDesign = dbCardDesigns.find(d => d.design_id === cardFormat);
                                    return globalDesign || cardFormat;
                                };
                                const design = resolveDesign(item.card_design);
                                onGeneratePDF({
                                    id: qrId,
                                    codes: [{ qrId, pin: item.pin }]
                                }, paperFormat, design, Boolean(item.status === "PROMOTION"));
                            }}
                        >
                            <FileText className="mr-2 h-4 w-4" />
                            {t('list.ban.pdf')}
                        </Button>
                        <Button
                            variant="outline"
                            size="default"
                            className="flex-1 sm:flex-none h-10"
                            onClick={async (e) => {
                                e.stopPropagation();
                                const resolveDesign = (designId?: string) => {
                                    const targetId = item.card_design || cardFormat;
                                    const dbDesign = dbCardDesigns.find(d => d.design_id === targetId);
                                    if (dbDesign) return dbDesign;
                                    if (cardformats[targetId]) return targetId;
                                    const globalDesign = dbCardDesigns.find(d => d.design_id === cardFormat);
                                    return globalDesign || cardFormat;
                                };
                                const design = resolveDesign(item.card_design);
                                await generateCSVExport({
                                    id: qrId,
                                    codes: [{ qrId, pin: item.pin }]
                                }, design);
                            }}
                        >
                            <Download className="mr-2 h-4 w-4" />
                            {t('list.ban.image')}
                        </Button>
                    </div>
                    {item.status !== 'BANNED' ? (
                        <div className="flex-1 sm:flex-none">
                            <BanButton
                                qrId={qrId}
                                apiUrl={apiUrl}
                                isBanned={false}
                                size="default"
                                className="w-full sm:w-auto h-10"
                                onSuccess={() => {
                                    setOpen(false);
                                    onRefresh();
                                }}
                            />
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-2 flex-1 sm:flex-none">
                            <BanButton
                                qrId={qrId}
                                apiUrl={apiUrl}
                                isBanned={true}
                                size="default"
                                className="flex-1 sm:flex-none h-10"
                                onSuccess={() => {
                                    setOpen(false);
                                    onRefresh();
                                }}
                            />
                            <Button
                                variant="destructive"
                                size="default"
                                className="flex-1 sm:flex-none h-10 bg-red-600 hover:bg-red-700"
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!confirm(t('list.deleteBanned.confirm'))) return;
                                    try {
                                        await adminApi.admin_qr_deleteban({ target: qrId });
                                        alert(t('list.deleteBanned.success', { count: 1 }));
                                        setOpen(false);
                                        onRefresh();
                                    } catch (err) {
                                        alert(t('list.deleteBanned.failed'));
                                    }
                                }}
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                {tShop('product.delete')}
                            </Button>
                        </div>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function BanButton({ qrId, apiUrl, onSuccess, size = "sm", className, isBanned = false }: {
    qrId: string,
    apiUrl: string,
    onSuccess: () => void,
    size?: "default" | "sm" | "lg" | "icon",
    className?: string,
    isBanned?: boolean
}) {
    const t = useTranslations('AdminPage');
    const [loading, setLoading] = useState(false);
    const [showReasonInput, setShowReasonInput] = useState(false);
    const [reason, setReason] = useState("");

    const handleAction = async (comment?: string) => {
        if (!isBanned && !comment) {
            setShowReasonInput(true);
            return;
        }

        if (isBanned) {
            if (!confirm(t('list.restore.confirm'))) return;
        } else {
            // Confirm with reason
            if (!confirm(t('list.ban.confirm'))) return;
        }

        setLoading(true);
        try {
            const params: any = { qr_id: qrId };
            if (comment) params.reason = comment;
            await adminApi.admin_qr_ban(params);
            onSuccess();
        } catch (e) {
            alert(isBanned ? t('list.restore.failed') : t('list.ban.failed'));
        } finally {
            setLoading(false);
            setShowReasonInput(false);
        }
    };


    if (isBanned) {
        return (
            <Button
                variant="outline"
                size={size}
                onClick={(e) => { e.stopPropagation(); handleAction(); }}
                disabled={loading}
                className={cn("border-emerald-600 text-emerald-600 hover:bg-emerald-50", className)}
            >
                <RotateCcw className="mr-2 h-4 w-4" />
                {loading ? '...' : t('list.restore.button')}
            </Button>
        );
    }

    if (showReasonInput) {
        return (
            <div className="flex gap-2 w-full sm:w-auto">
                <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t('list.ban.reasonPlaceholder')}
                    className="h-10 text-sm flex-1 sm:w-64"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                />
                <Button variant="destructive" onClick={(e) => { e.stopPropagation(); handleAction(reason); }} disabled={loading} className="h-10">
                    {loading ? '...' : t('list.ban.button')}
                </Button>
                <Button variant="ghost" onClick={(e) => { e.stopPropagation(); setShowReasonInput(false); }} disabled={loading} className="h-10">
                    ✕
                </Button>
            </div>
        );
    }

    return (
        <Button
            variant="destructive"
            size={size}
            onClick={(e) => { e.stopPropagation(); setShowReasonInput(true); }}
            disabled={loading}
            className={cn("bg-red-600 hover:bg-red-700 font-bold", className, size === "sm" ? "h-6 text-xs" : "")}
        >
            {loading ? '...' : t('list.ban.button')}
        </Button>
    );
}

function DataDumpSection({ apiUrl }: { apiUrl: string }) {
    const t = useTranslations('AdminPage');
    const [userId, setUserId] = useState("");
    const [shopId, setShopId] = useState("");
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const handleDump = async () => {
        if (!userId && !shopId) return;
        setLoading(true);
        try {
            const pks: string[] = [];
            if (userId) pks.push(`USER#${userId}`);
            if (shopId) pks.push(`SHOP#${shopId}`);
            const result = await adminApi.admin_dump({
                pks
            });
            setData(result.items);
        } catch (e) {
            alert(t('list.dump.error'));
        } finally {
            setLoading(false);
        }
    };


    return (
        <Card className="flex flex-col w-full">
            <CardHeader className="flex-none">
                <CardTitle>{t('list.dump.title')}</CardTitle>
            </CardHeader>
            <CardContent className="">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="dumpUserId">{t('list.dump.userId')}</Label>
                        <Input
                            id="dumpUserId"
                            placeholder=""
                            value={userId}
                            onChange={(e) => setUserId(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="dumpShopId">{t('list.dump.shopId')}</Label>
                        <Input
                            id="dumpShopId"
                            placeholder=""
                            value={shopId}
                            onChange={(e) => setShopId(e.target.value)}
                        />
                    </div>
                </div>
                <Button onClick={handleDump} disabled={loading || (!userId && !shopId)} className="w-full sticky top-0 z-10 mt-3">
                    {loading ? t('list.dump.loading') : t('list.dump.button')}
                </Button>
                {data && (
                    <div className="mt-4 ">
                        {data.length === 0 ? (
                            <p className="text-gray-500 text-sm">{t('list.dump.noItems')}</p>
                        ) : (
                            <pre className="bg-gray-100 p-4 rounded-xl text-xs font-mono overflow-auto max-h-96 text-black h-[70vh] max-h-[70vh]">
                                {JSON.stringify(data, null, 2)}
                            </pre>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function ManagerLinkingSection({ apiUrl }: { apiUrl: string }) {
    const t = useTranslations('AdminPage');
    const [userIdsStr, setUserIdsStr] = useState("");
    const [shopIdsStr, setShopIdsStr] = useState("");
    const [loading, setLoading] = useState(false);
    const [validationData, setValidationData] = useState<{ users: any[], shops: any[] } | null>(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

    const handleValidate = async () => {
        const uids = Array.from(new Set(userIdsStr.split('\n').map(s => s.trim()).filter(Boolean)));
        const sids = Array.from(new Set(shopIdsStr.split('\n').map(s => s.trim()).filter(Boolean)));

        if (uids.length === 0 || sids.length === 0) return;

        setLoading(true);
        try {
            const data = await adminApi.admin_links({
                user_ids: uids,
                shop_ids: sids,
                action: 'validate'
            });
            setValidationData(data);
            setIsConfirmOpen(true);
        } catch (e: any) {
            const errData = e;
            if (errData?.missingIdsFormatted) {
                alert(t('list.managerLinking.errorMissingIds', { ids: errData.missingIdsFormatted }));
            } else {
                alert(t('list.managerLinking.error'));
            }
        } finally {
            setLoading(false);
        }
    };

    const handleExecute = async () => {
        const uids = Array.from(new Set(userIdsStr.split('\n').map(s => s.trim()).filter(Boolean)));
        const sids = Array.from(new Set(shopIdsStr.split('\n').map(s => s.trim()).filter(Boolean)));

        setLoading(true);
        try {
            await adminApi.admin_links({
                user_ids: uids,
                shop_ids: sids,
                action: 'execute'
            });
            alert(t('list.managerLinking.success'));
            setIsConfirmOpen(false);
            setUserIdsStr("");
            setShopIdsStr("");
            setValidationData(null);
        } catch (e) {
            alert(t('list.managerLinking.error'));
        } finally {
            setLoading(false);
        }
    };


    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('list.managerLinking.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-gray-500">{t('list.managerLinking.description')}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="linkingUserIds">{t('list.managerLinking.userIds')}</Label>
                        <Textarea
                            id="linkingUserIds"
                            placeholder=""
                            value={userIdsStr}
                            onChange={(e) => setUserIdsStr(e.target.value)}
                            className="min-h-[120px] font-mono text-sm text-black"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="linkingShopIds">{t('list.managerLinking.shopIds')}</Label>
                        <Textarea
                            id="linkingShopIds"
                            placeholder=""
                            value={shopIdsStr}
                            onChange={(e) => setShopIdsStr(e.target.value)}
                            className="min-h-[120px] font-mono text-sm text-black"
                        />
                    </div>
                </div>
                <Button onClick={handleValidate} disabled={loading || !userIdsStr || !shopIdsStr} className="w-full">
                    {loading ? t('list.managerLinking.validating') : t('list.managerLinking.validateButton')}
                </Button>

                <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>{t('list.managerLinking.confirmTitle')}</DialogTitle>
                            <DialogDescription>
                                {t('list.managerLinking.confirmMessage')}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                            <div className="space-y-2">
                                <h4 className="font-semibold text-sm border-b pb-1">{t('list.managerLinking.userList')}</h4>
                                <ul className="list-disc list-inside space-y-1 text-sm">
                                    {validationData?.users.map((u: any) => (
                                        <li key={u.id}>
                                            <span className="font-mono text-xs text-gray-500 mr-2">{u.id}</span>
                                            <span className="font-medium">{u.email}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="space-y-2">
                                <h4 className="font-semibold text-sm border-b pb-1">{t('list.managerLinking.shopList')}</h4>
                                <ul className="list-disc list-inside space-y-1 text-sm">
                                    {validationData?.shops.map((s: any) => (
                                        <li key={s.id}>
                                            <span className="font-mono text-xs text-gray-500 mr-2">{s.id}</span>
                                            <span className="font-medium">{s.name}</span>
                                            <span className="text-gray-500 text-xs ml-2">({s.email})</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                            <Button variant="outline" onClick={() => setIsConfirmOpen(false)} disabled={loading}>
                                {t('list.managerLinking.cancel')}
                            </Button>
                            <Button onClick={handleExecute} disabled={loading}>
                                {loading ? t('list.managerLinking.executing') : t('list.managerLinking.executeButton')}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </CardContent>
        </Card>
    );
}

function ShopOwnerChangeSection({ apiUrl }: { apiUrl: string }) {
    const t = useTranslations('AdminPage');
    const [shopId, setShopId] = useState("");
    const [newUserId, setNewUserId] = useState("");
    const [loading, setLoading] = useState(false);
    const [validationData, setValidationData] = useState<{ shopName: string, oldOwnerEmail: string, newOwnerEmail: string } | null>(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

    const handleValidate = async () => {
        if (!shopId.trim() || !newUserId.trim()) return;
        setLoading(true);
        try { // error section
            const data = await adminApi.admin_changeowner({
                shop_id: shopId.trim().replace(/^SHOP#/, ""),
                new_user_id: newUserId.trim().replace(/^USER#/, ""),
                action: 'validate'
            });
            setValidationData(data);
            setIsConfirmOpen(true);
        } catch (e: any) {
            const errData = e;
            let msg = t('list.ownerChange.error');
            if (errData?.message) msg += ": " + errData.message;
            if (errData?.error) msg += " (" + errData.error + ")";
            alert(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleExecute = async () => {
        if (!shopId.trim() || !newUserId.trim()) return;
        setLoading(true);
        try {
            await adminApi.admin_changeowner({
                shop_id: shopId.trim().replace(/^SHOP#/, ""),
                new_user_id: newUserId.trim().replace(/^USER#/, ""),
                action: 'execute'
            });
            alert(t('list.ownerChange.success'));
            setIsConfirmOpen(false);
            setShopId("");
            setNewUserId("");
            setValidationData(null);
        } catch (e: any) {
            const errData = e;
            let msg = t('list.ownerChange.error');
            if (errData?.message) msg += ": " + errData.message;
            if (errData?.error) msg += " (" + errData.error + ")";
            alert(msg);
        } finally {
            setLoading(false);
        }
    };


    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('list.ownerChange.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-gray-500">{t('list.ownerChange.description')}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="ownerChangeShopId">{t('list.ownerChange.shopId')}</Label>
                        <Input
                            id="ownerChangeShopId"
                            placeholder=""
                            value={shopId}
                            onChange={(e) => setShopId(e.target.value)}
                            className="font-mono text-sm text-black"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="ownerChangeNewUserId">{t('list.ownerChange.newUserId')}</Label>
                        <Input
                            id="ownerChangeNewUserId"
                            placeholder=""
                            value={newUserId}
                            onChange={(e) => setNewUserId(e.target.value)}
                            className="font-mono text-sm text-black"
                        />
                    </div>
                </div>
                <Button onClick={handleValidate} disabled={loading || !shopId.trim() || !newUserId.trim()} className="w-full">
                    {loading ? t('list.ownerChange.validating') : t('list.ownerChange.checkButton')}
                </Button>

                <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{t('list.ownerChange.confirmTitle')}</DialogTitle>
                            <DialogDescription>
                                {validationData && t('list.ownerChange.confirmMessage', {
                                    shopName: validationData.shopName,
                                    oldEmail: validationData.oldOwnerEmail,
                                    newEmail: validationData.newOwnerEmail
                                })}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex gap-2 justify-end mt-4">
                            <Button variant="outline" onClick={() => setIsConfirmOpen(false)} disabled={loading}>
                                {t('list.ownerChange.cancel')}
                            </Button>
                            <Button onClick={handleExecute} disabled={loading}>
                                {loading ? t('list.ownerChange.executing') : t('list.ownerChange.executeButton')}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </CardContent>
        </Card>
    );
}

function AdminShopCreationSection({ apiUrl }: { apiUrl: string }) {
    const t = useTranslations('AdminPage');
    const [userId, setUserId] = useState("");
    const [loading, setLoading] = useState(false);
    const [userData, setUserData] = useState<{ id: string, email: string } | null>(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

    const handleCheckUser = async () => {
        if (!userId.trim()) return;
        setLoading(true);
        try {
            const data = await adminApi.admin_links({
                user_ids: [userId.trim().replace(/^USER#/, "")],
                shop_ids: [],
                action: 'validate'
            });
            if (data.users && data.users.length > 0) {
                setUserData(data.users[0]);
                setIsConfirmOpen(true);
            }
        } catch (e) {
            alert(t('list.shopCreation.error'));
        } finally {
            setLoading(false);
        }
    };


    const handleCreateShop = async () => {
        if (!userData) return;
        setLoading(true);
        try {
            await adminApi.admin_shop_create({
                name: "My Default Shop",
                owner_id: userData.id,
                gm_ids: []
            });
            alert(t('list.shopCreation.success'));
            setIsConfirmOpen(false);
            setUserId("");
            setUserData(null);
        } catch (e: any) {
            const errData = e;
            alert(t('list.shopCreation.error') + (errData?.message ? ": " + errData.message : ""));
        } finally {
            setLoading(false);
        }
    };


    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('list.shopCreation.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-gray-500">{t('list.shopCreation.description')}</p>
                <div className="space-y-2">
                    <Label htmlFor="creationUserId">{t('list.shopCreation.userId')}</Label>
                    <Input
                        id="creationUserId"
                        placeholder=""
                        value={userId}
                        onChange={(e) => setUserId(e.target.value)}
                        className="font-mono text-sm text-black"
                    />
                </div>
                <Button onClick={handleCheckUser} disabled={loading || !userId.trim()} className="w-full">
                    {loading ? t('list.shopCreation.validating') : t('list.shopCreation.checkButton')}
                </Button>

                <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{t('list.shopCreation.confirmTitle')}</DialogTitle>
                            <DialogDescription>
                                {t('list.shopCreation.confirmMessage', { email: userData?.email || "" })}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex gap-2 justify-end mt-4">
                            <Button variant="outline" onClick={() => setIsConfirmOpen(false)} disabled={loading}>
                                {t('list.shopCreation.cancel')}
                            </Button>
                            <Button onClick={handleCreateShop} disabled={loading}>
                                {loading ? t('list.shopCreation.executing') : t('list.shopCreation.executeButton')}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </CardContent>
        </Card>
    );
}

function AdminShopCardDesignLinkSection({ apiUrl, dbCardDesigns }: { apiUrl: string, dbCardDesigns: any[] }) {
    const t = useTranslations('AdminPage');
    const tLink = useTranslations('AdminPage.list.shopCardDesignLink');
    const [shopId, setShopId] = useState("");
    const [shopData, setShopData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [selectedDesignIds, setSelectedDesignIds] = useState<string[]>([]);

    const handleLoadShop = async () => {
        if (!shopId.trim()) return;
        setLoading(true);
        try {
            const data = await adminApi.admin_shop_carddesign_link_get({ shop_id: shopId.trim() });
            setShopData(data);
            setSelectedDesignIds(data.card_designs || []);
        } catch (e: any) {
            alert(tLink('notFound') + ": " + (e.message || ""));
            setShopData(null);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!shopData) return;
        setSaving(true);
        try {
            await adminApi.admin_shop_carddesign_link_update({
                shop_id: shopData.PK.replace(/^SHOP#/, ""),
                card_designs: selectedDesignIds
            });
            alert(tLink('saveSuccess'));
        } catch (e: any) {
            alert(tLink('saveFailed') + ": " + (e.message || ""));
        } finally {
            setSaving(false);
        }
    };

    const toggleDesign = (designId: string) => {
        setSelectedDesignIds(prev =>
            prev.includes(designId)
                ? prev.filter(id => id !== designId)
                : [...prev, designId]
        );
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>{tLink('title')}</CardTitle>
                <CardDescription>{tLink('description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex gap-2">
                    <div className="flex-1">
                        <Label htmlFor="manageShopId">{tLink('shopIdLabel')}</Label>
                        <Input
                            id="manageShopId"
                            placeholder={tLink('shopIdPlaceholder')}
                            value={shopId}
                            onChange={(e) => setShopId(e.target.value)}
                            className="font-mono"
                        />
                    </div>
                    <Button onClick={handleLoadShop} disabled={loading || !shopId.trim()} className="mt-auto">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                        {tLink('loadButton')}
                    </Button>
                </div>

                {shopData && (
                    <div className="space-y-6 pt-4 border-t animate-in fade-in duration-300">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="text-gray-500">{tLink('shopNameLabel')}</Label>
                                <p className="font-bold text-lg">{shopData.name}</p>
                            </div>
                            <div>
                                <Label className="text-gray-500">{tLink('emailLabel')}</Label>
                                <p>{shopData.email || "-"}</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <Label className="text-gray-500">{tLink('allowedDesignsLabel')}</Label>
                            <p className="text-xs text-gray-400 mb-2 italic">{tLink('allowedDesignsDesc')}</p>

                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                {dbCardDesigns.map((design) => {
                                    const isSelected = selectedDesignIds.includes(design.design_id);
                                    return (
                                        <div
                                            key={design.design_id}
                                            onClick={() => toggleDesign(design.design_id)}
                                            className={cn(
                                                "relative cursor-pointer rounded-lg border-2 p-1 transition-all group overflow-hidden",
                                                isSelected
                                                    ? "border-green-500 bg-green-50"
                                                    : "border-transparent bg-gray-100 hover:border-gray-200"
                                            )}
                                        >
                                            {isSelected && (
                                                <div className="absolute top-0 right-0 bg-green-500 text-white px-1.5 py-0.5 text-[8px] font-bold rounded-bl shadow-sm z-10 animate-in fade-in zoom-in duration-200">
                                                    LINK
                                                </div>
                                            )}
                                            <div className="aspect-[84/52] relative rounded overflow-hidden">
                                                <img
                                                    src={design.thumbf || design.bgimgf}
                                                    alt={design.description}
                                                    className="w-full h-full object-cover"
                                                    crossOrigin="anonymous"
                                                />
                                                {isSelected && (
                                                    <div className="absolute inset-0 bg-green-500/10 flex items-center justify-center">
                                                        <div className="bg-mist-500 text-white rounded-full p-1 shadow-lg">
                                                            <Plus className="w-4 h-4 rotate-45" />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="mt-1 px-1">
                                                <p className="text-[10px] font-medium truncate text-black" title={design.description}>
                                                    {design.description}
                                                </p>
                                                <p className="text-[8px] text-gray-500 font-mono truncate">
                                                    {design.design_id}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <Button onClick={handleSave} disabled={saving} className="w-full bg-mist-600 hover:bg-mist-700">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                            {tLink('saveButton')}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function CardOrderListSection({
    orders,
    loading,
    statusFilter,
    setStatusFilter,
    shopIdFilter,
    setShopIdFilter,
    onUpdateStatus,
    onRefresh,
    dbCardDesigns,
    paperFormat,
    cardFormat
}: {
    orders: any[],
    loading: boolean,
    statusFilter: string,
    setStatusFilter: (s: string) => void,
    shopIdFilter: string,
    setShopIdFilter: (s: string) => void,
    onUpdateStatus: (shopId: string, orderId: string, status: string) => Promise<void>,
    onRefresh: () => void,
    dbCardDesigns: any[],
    paperFormat: string,
    cardFormat: string
}) {
    const t = useTranslations('AdminPage');
    const tc = useTranslations('AdminPage.cardOrders');
    const st = useTranslations('Status');
    const ts = useTranslations('Timestamp');
    const [isProcessing, setIsProcessing] = useState<string | null>(null);

    const filteredOrders = orders.filter(o =>
        !shopIdFilter || (o.shop_id && o.shop_id.toLowerCase().includes(shopIdFilter.toLowerCase())) || (o.shop_name && o.shop_name.toLowerCase().includes(shopIdFilter.toLowerCase()))
    );

    const handleExport = async (order: any, type: 'pdf' | 'csv') => {
        setIsProcessing(order.order_id);
        try {
            // 1. Generate QR codes for this order
            // Note: In a real system, we might want to ensure these are unique and saved.
            // For now, we generate a fresh batch.
            const data = await adminApi.admin_qr_generate({
                count: order.quantity,
                shop_id: order.shop_id,
                product_id: order.product_id,
                card_design: order.card_design || cardFormat,
                activate_now: false
            });

            // 2. Transition status to PRINTING if it was ORDERED
            if (order.status === 'ORDERED') {
                await onUpdateStatus(order.shop_id, order.order_id, 'PRINTING');
            }

            // 3. Trigger download
            const batch = {
                id: `batch-${data.batch_id}`,
                count: data.count,
                codes: data.data,
                date: new Date().toLocaleString()
            };

            const resolveDesign = (designId?: string) => {
                const targetId = designId || cardFormat;
                const dbDesign = dbCardDesigns.find(d => d.design_id === targetId);
                if (dbDesign) return dbDesign;
                if (cardformats[targetId]) return targetId;
                const globalDesign = dbCardDesigns.find(d => d.design_id === cardFormat);
                return globalDesign || cardFormat;
            };
            const design = resolveDesign(order.card_design);

            if (type === 'pdf') {
                await generatePDF(batch, paperFormat, design);
            } else {
                await generateCSVExport(batch, design);
            }
        } catch (e) {
            console.error("Export failed", e);
            alert("Export failed. Please check if the design and shop are correct.");
        } finally {
            setIsProcessing(null);
        }
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div>
                    <CardTitle>{tc('title')}</CardTitle>
                </div>
                <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
                    <RotateCcw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                    {t('list.refresh')}
                </Button>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    <div className="flex flex-wrap gap-4 items-end">
                        <div className="flex flex-wrap gap-1">
                            {['ORDERED', 'PRINTING', 'SHIPPED', 'COMPLETED', `CANCELLED`, 'REJECTED'].map((s) => (
                                <Button
                                    key={s}
                                    variant={statusFilter === s ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setStatusFilter(s)}
                                    className="text-xs"
                                >
                                    {st(s.toLowerCase())}
                                </Button>
                            ))}
                        </div>
                        <div className="flex-1 min-w-[200px]">
                            <Label htmlFor="orderShopFilter" className="text-xs text-gray-500 mb-1 block">
                                {tc('shopIdFilter')}
                            </Label>
                            <div className="relative">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <Input
                                    id="orderShopFilter"
                                    placeholder="Shop ID or Name..."
                                    value={shopIdFilter}
                                    onChange={(e) => setShopIdFilter(e.target.value)}
                                    className="pl-8 h-9 text-black"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="rounded-md border border-gray-200 overflow-hidden">
                        <Table>
                            <TableHeader className="bg-gray-50">
                                <TableRow>
                                    <TableHead className="w-[150px]">{tc('table.date')}</TableHead>
                                    <TableHead>{tc('table.shop')}</TableHead>
                                    <TableHead className="text-right">{tc('table.quantity')}</TableHead>
                                    <TableHead className="text-center">{tc('table.status')}</TableHead>
                                    <TableHead className="text-center">{tc('table.actions')}</TableHead>
                                    <TableHead className="w-[150px]">{tc('table.dateupdated')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">
                                            <Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400" />
                                        </TableCell>
                                    </TableRow>
                                ) : filteredOrders.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center text-gray-500">
                                            No orders found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredOrders.map((order) => (
                                        <TableRow key={order.order_id} className="text-black hover:bg-gray-50 transition-colors">
                                            <TableCell className="text-xs text-gray-500">
                                                {new Date(order.ts_created_at).toLocaleString()}
                                            </TableCell>
                                            <TableCell>
                                                <div className="font-medium leading-none mb-1">{order.shop_name || '-'}</div>
                                                {order.shop_owner_email && (
                                                    <div className="text-[10px] text-green-700 font-medium truncate max-w-[150px] mb-0.5">
                                                        {order.shop_owner_email}
                                                    </div>
                                                )}
                                                <div className="text-[9px] text-gray-400 font-mono leading-none">{order.shop_id}</div>
                                            </TableCell>
                                            <TableCell className="text-right font-bold">
                                                {order.quantity}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <span className={cn(
                                                    "px-2 py-1 rounded text-[11px] font-bold inline-block min-w-[80px]",
                                                    order.status === 'ORDERED' ? 'bg-blue-100 text-blue-800' :
                                                        order.status === 'PRINTING' ? 'bg-yellow-100 text-yellow-800' :
                                                            order.status === 'SHIPPED' ? 'bg-indigo-100 text-indigo-800' :
                                                                order.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                                                                    order.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                                                                        'bg-gray-100 text-gray-800'
                                                )}>
                                                    {st(order.status.toLowerCase())}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-0.5 ">
                                                    {(order.status === 'ORDERED' || order.status === 'PRINTING') && (
                                                        <div className="gap-1 rounded-sm p-1 bg-green-100">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-6 text-xs text-black hover:bg-green-300"
                                                                onClick={() => handleExport(order, 'pdf')}
                                                                disabled={!!isProcessing}
                                                            >
                                                                {isProcessing === order.order_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3 mr-1" />}
                                                                PDF
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-6 text-xs text-black hover:bg-green-300"
                                                                onClick={() => handleExport(order, 'csv')}
                                                                disabled={!!isProcessing}
                                                            >
                                                                {isProcessing === order.order_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
                                                                CSV
                                                            </Button>
                                                        </div>
                                                    )}
                                                    {order.status === 'PRINTING' && (
                                                        <Button
                                                            variant="default"
                                                            size="sm"
                                                            className="flex h-8 rounded-sm text-xs bg-indigo-300 hover:bg-indigo-500 text-indigo-800 font-bold hover:text-indigo-100"
                                                            onClick={() => onUpdateStatus(order.shop_id, order.order_id, 'SHIPPED')}
                                                        >
                                                            {tc('markAsShipped')}
                                                        </Button>
                                                    )}
                                                    {(order.status === 'ORDERED' || order.status === 'PRINTING') && (

                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 w-8 p-0 h-8 rounded-sm items-center justify-center text-red-500 bg-red-100 hover:bg-red-500 hover:text-white"
                                                            onClick={() => {
                                                                if (window.confirm(tc('rejectConfirm'))) {
                                                                    onUpdateStatus(order.shop_id, order.order_id, 'REJECTED');
                                                                }
                                                            }}
                                                            title={tc('rejectOrder')}
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </Button>
                                                    )}

                                                </div>
                                            </TableCell>
                                            <TableCell className="text-xs text-gray-500">
                                                {new Date(order.ts_updated_at).toLocaleString()}
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
