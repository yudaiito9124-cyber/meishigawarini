"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Inbox, ChevronDown, ExternalLink, Copy, Check } from "lucide-react";
import { userApi } from "@/lib/api/user";

export default function ReceivedHistoryPage() {
    const t = useTranslations('UserProfilePage');
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState<Array<{
        uuid: string,
        timestamp: string,
        pin?: string,
        product_name?: string,
        product_image_url?: string,
        card_design_thumbf?: string,
        shop_name?: string
    }>>([]);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(text);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const fetchHistory = useCallback(async () => {
        setLoading(true);
        try {
            const data = await userApi.user_history_get({});
            setHistory(data.received || []);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    return (
        <div className="min-h-screen bg-mist-50 flex flex-col items-center py-12 px-4 text-gray-900">
            <Card className="w-full max-w-2xl shadow-xl border-none bg-white/80 backdrop-blur-md rounded-3xl overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-purple-500 to-indigo-600 p-8 text-white flex flex-col gap-4">
                    <div className="flex justify-between items-start">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-white hover:bg-white/20 -ml-2 h-8"
                            onClick={() => router.push('/user')}
                        >
                            <ChevronDown className="h-4 w-4 mr-1 rotate-90" /> {t('back')}
                        </Button>
                    </div>
                    <div className="flex flex-row items-center gap-4">
                        <div className="p-3 bg-white/20 rounded-2xl">
                            <Inbox className="w-8 h-8 text-white" />
                        </div>
                        <div>
                            <CardTitle className="text-2xl font-black tracking-tight">{t('receiveList')}</CardTitle>
                            <p className="text-purple-100/80 text-sm mt-1">{t('receiveListDesc')}</p>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center p-12">
                            <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                        </div>
                    ) : history.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-12 text-center text-gray-500">
                            <Inbox className="w-12 h-12 text-gray-300 mb-4" />
                            <p>受け取り履歴がありません。</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {history.map((item, idx) => (
                                <div key={`${item.uuid}-${idx}`} className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 hover:bg-gray-50 transition-colors">
                                    {/* Combined Image Section */}
                                    <div className="relative w-full sm:w-32 aspect-[84/52] rounded-xl overflow-hidden shadow-md border border-gray-100 bg-gray-50 shrink-0">
                                        {item.card_design_thumbf ? (
                                            <img
                                                src={item.card_design_thumbf}
                                                alt="Card Design"
                                                className="absolute inset-0 w-full h-full object-cover"
                                                crossOrigin="anonymous"
                                            />
                                        ) : (
                                            <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
                                                <Inbox className="w-6 h-6 text-gray-300" />
                                            </div>
                                        )}
                                        {/* Gradient Overlay */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />

                                        {/* Product Image Inset */}
                                        {item.product_image_url && (
                                            <div className="absolute bottom-1 right-1 w-8 h-8 rounded-md overflow-hidden border border-white/50 shadow-sm bg-white">
                                                <img
                                                    src={item.product_image_url}
                                                    alt={item.product_name || "Product"}
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Info Section */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-col gap-0.5 mb-2">
                                            {item.product_name && (
                                                <h3 className="font-bold text-gray-900 truncate">{item.product_name}</h3>
                                            )}
                                            {item.shop_name && (
                                                <p className="text-xs text-gray-500 font-medium">@{item.shop_name}</p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 mb-1 group">
                                            <p className="text-[10px] font-mono text-gray-400 truncate">
                                                {item.uuid}
                                            </p>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-4 w-4 text-gray-300"
                                                onClick={() => handleCopy(item.uuid)}
                                            >
                                                {copiedId === item.uuid ? (
                                                    <Check className="h-2.5 w-2.5 text-green-500" />
                                                ) : (
                                                    <Copy className="h-2.5 w-2.5" />
                                                )}
                                            </Button>
                                        </div>
                                        <p className="text-[10px] text-gray-500">
                                            受取日: {new Date(item.timestamp).toLocaleString()}
                                        </p>
                                    </div>

                                    {/* PIN and Actions Section */}
                                    <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-3">
                                        {item.pin && (
                                            <div className="flex items-center gap-1.5 bg-gray-100 px-3 py-1.5 rounded-xl border border-gray-200">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">PIN</span>
                                                <span className="font-mono font-bold text-sm text-gray-700 tracking-wider">{item.pin}</span>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 ml-1 text-gray-400 hover:text-gray-900"
                                                    onClick={() => handleCopy(item.pin!)}
                                                >
                                                    {copiedId === item.pin ? (
                                                        <Check className="h-3 w-3 text-green-500" />
                                                    ) : (
                                                        <Copy className="h-3 w-3" />
                                                    )}
                                                </Button>
                                            </div>
                                        )}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="gap-1.5 rounded-xl border-purple-200 text-purple-700 hover:bg-purple-50 text-xs h-9 px-4 shrink-0"
                                            onClick={() => window.open(`/receive/${item.uuid}`, '_blank')}
                                        >
                                            詳細 <ExternalLink className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
