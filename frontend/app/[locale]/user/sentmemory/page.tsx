"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Send, ChevronDown, ExternalLink, Copy, Check } from "lucide-react";
import { userApi } from "@/lib/api/user";

export default function SendHistoryPage() {
    const t = useTranslations('UserProfilePage');
    const router = useRouter();

    const [expandedId, setExpandedId] = useState<string | null>(null);

    const toggleExpand = (id: string, e: React.MouseEvent) => {
        // Prevent toggling if clicking a button inside
        if ((e.target as HTMLElement).closest('button')) return;
        setExpandedId(prev => prev === id ? null : id);
    };

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
            setHistory(data.sent || []);
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
        <div className="min-h-screen bg-slate-50 flex flex-col items-center py-12 px-4 text-gray-900 font-sans">
            <div className="w-full max-w-2xl flex justify-start mb-6">
                <Button
                    variant="outline"
                    className="rounded-full bg-white/50 backdrop-blur-sm border-gray-200 text-gray-500 hover:text-gray-900"
                    onClick={() => router.push('/user')}
                >
                    <ChevronDown className="h-4 w-4 mr-1 rotate-90" /> {t('back')}
                </Button>
            </div>

            <div className="w-full max-w-4xl mb-12">
                <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-10 text-white rounded-[2rem] shadow-xl flex flex-col gap-4">
                    <div className="flex flex-row items-center gap-4">
                        <div className="p-3 bg-white/20 rounded-2xl shadow-inner backdrop-blur-md">
                            <Send className="w-8 h-8 text-white" />
                        </div>
                        <div>
                            <CardTitle className="text-3xl font-black tracking-tight">{t('sendList')}</CardTitle>
                            <p className="text-green-100/80 text-sm font-bold uppercase tracking-widest mt-1">{t('sendListDesc')}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="w-full max-w-4xl">
                {loading ? (
                    <div className="flex items-center justify-center p-16">
                        <Loader2 className="w-10 h-10 animate-spin text-green-500" />
                    </div>
                ) : history.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-16 text-center text-gray-400 bg-white/50 backdrop-blur-xl rounded-[2rem] border border-white/20">
                        <div className="p-6 bg-gray-50 rounded-full mb-4">
                            <Send className="w-12 h-12 text-gray-200" />
                        </div>
                        <p className="font-bold uppercase tracking-widest text-xs">{t('noSentHistory')}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        {history.map((item) => {
                            const isFlipped = expandedId === item.uuid;
                            return (
                                <div
                                    key={item.uuid}
                                    className={`group relative aspect-[84/52] w-full cursor-pointer transition-all duration-500 rounded-3xl ${isFlipped ? 'z-50' : 'z-10'}`}
                                    style={{
                                        perspective: '1000px',
                                        transformStyle: 'preserve-3d'
                                    }}
                                    onClick={() => setExpandedId(prev => prev === item.uuid ? null : item.uuid)}
                                >
                                    {/* Main Shine/Reflection Layer */}
                                    <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000">
                                        <div
                                            className="absolute inset-[-100%] bg-gradient-to-tr from-transparent via-white/[0.00] to-transparent rotate-[25deg] transition-transform duration-[600ms] ease-out-back"
                                            style={{
                                                transform: isFlipped ? 'translateX(20%) translateY(20%)' : 'translateX(-20%) translateY(-20%)',
                                                filter: 'blur(20px)'
                                            }}
                                        />
                                        {/* Surface Gloss */}
                                        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-transparent" />
                                    </div>

                                    {/* The rotating container */}
                                    <div
                                        className={`w-full h-full relative preserve-3d transition-all duration-700 md:duration-1000 rounded-2xl ${isFlipped ? 'rotate-y-180 -translate-y-8 scale-[1.03] rotate-x-[2deg]' : 'group-hover:-translate-y-4 group-hover:rotate-x-[2deg]'
                                            }`}
                                        style={{
                                            transformStyle: 'preserve-3d',
                                            transitionTimingFunction: isFlipped ? 'cubic-bezier(0.34, 1.56, 0.64, 1)' : 'cubic-bezier(0.25, 1, 0.5, 1)'
                                        }}
                                    >
                                        {/* Front Face */}
                                        <div
                                            className={`absolute inset-0 w-full h-full backface-hidden transition-all duration-500 rounded-2xl overflow-hidden ${isFlipped ? 'shadow-none' : 'shadow-[0_20px_50px_rgba(0,0,0,0.15)] group-hover:shadow-[0_60px_100px_rgba(0,0,0,0.25)]'
                                                }`}
                                            style={{
                                                backfaceVisibility: 'hidden',
                                                WebkitBackfaceVisibility: 'hidden',
                                                transform: 'translateZ(1px)'
                                            }}
                                        >
                                            <Card className="w-full h-full p-0 border-b-[6px] border-emerald-950/40 bg-slate-100 rounded-2xl overflow-hidden border-none shadow-none">
                                                <CardContent className="p-0 h-full relative rounded-2xl overflow-hidden">
                                                    {/* Card Design Image */}
                                                    <div className="absolute inset-0 w-full h-full pointer-events-none rounded-2xl overflow-hidden">
                                                        {item.card_design_thumbf ? (
                                                            <img
                                                                src={item.card_design_thumbf}
                                                                alt="Card Design"
                                                                className="w-full h-full object-cover"
                                                                crossOrigin="anonymous"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full bg-slate-200/80 flex items-center justify-center">
                                                                <Send className="w-12 h-12 text-slate-400/50" />
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Overlays (Decorative) */}
                                                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

                                                    {/* Floating Info Panel */}
                                                    <div className="absolute bottom-2 inset-x-5 py-1 px-4 bg-black/50 backdrop-blur-xl border border-white/20 rounded-2xl flex items-center justify-between pointer-events-none z-10 shadow-xl">
                                                        <div className="flex items-center gap-3 overflow-hidden">
                                                            {item.product_image_url && (
                                                                <div className="w-10 h-10 rounded-lg overflow-hidden border border-white/20 shadow-lg shrink-0">
                                                                    <img
                                                                        src={item.product_image_url}
                                                                        alt=""
                                                                        className="w-full h-full object-cover"
                                                                    />
                                                                </div>
                                                            )}
                                                            <div className="flex flex-col gap-0 overflow-hidden">
                                                                <span className="text-[7px] font-black text-white/90 uppercase tracking-[0.2em] leading-none mb-0.5">
                                                                    {new Date(item.timestamp).toLocaleDateString()}
                                                                </span>
                                                                <h3 className="text-sm font-black text-white tracking-tight leading-tight truncate pr-2">
                                                                    {item.product_name}
                                                                </h3>
                                                            </div>
                                                        </div>
                                                        <ChevronDown className="w-4 h-4 text-white/20 -rotate-90 shrink-0" />
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        </div>

                                        {/* Back Face */}
                                        <div
                                            className="absolute inset-0 w-full h-full backface-hidden"
                                            style={{
                                                backfaceVisibility: 'hidden',
                                                WebkitBackfaceVisibility: 'hidden',
                                                transform: 'rotateY(180deg) translateZ(1px)'
                                            }}
                                        >
                                            <Card className="w-full h-full p-0 border-b-4 border-emerald-950 bg-emerald-950 rounded-2xl shadow-2xl overflow-hidden">
                                                <CardContent className="p-6 h-full flex flex-col justify-between text-white border-2 border-white/10 rounded-2xl">
                                                    <div className="space-y-4">
                                                        <div className="pointer-events-none">
                                                            {item.shop_name && (
                                                                <p className="text-[9px] text-green-300 font-black uppercase tracking-[0.2em] leading-none">{item.shop_name}</p>
                                                            )}
                                                        </div>

                                                        {/* PIN Section */}
                                                        {item.pin && (
                                                            <div className="flex items-center justify-between p-3 rounded-xl bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 transition-all">
                                                                <div className="flex flex-col pointer-events-none">
                                                                    <span className="text-[7px] font-black text-green-300/40 uppercase tracking-widest">PIN</span>
                                                                    <span className="text-base font-mono font-black text-white tracking-[0.3em]">{item.pin}</span>
                                                                </div>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8 text-green-300/50 hover:text-white hover:bg-white/10 rounded-lg shrink-0"
                                                                    onClick={(e) => { e.stopPropagation(); handleCopy(item.pin!); }}
                                                                >
                                                                    {copiedId === item.pin ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="flex flex-col items-center gap-3">
                                                        <Button
                                                            className="w-fit h-11 px-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] uppercase tracking-[0.1em] shadow-xl gap-3 group/btn shrink-0"
                                                            onClick={(e) => { e.stopPropagation(); window.open(`/receive/${item.uuid}`, '_blank'); }}
                                                        >
                                                            {t('details')}
                                                            <ExternalLink className="w-4 h-4 transition-transform group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5" />
                                                        </Button>

                                                        {/* ID Row */}
                                                        <div className="flex items-center gap-1.5 opacity-30 hover:opacity-100 transition-opacity">
                                                            <span className="text-[8px] font-mono font-bold text-white/50 truncate tracking-tighter pointer-events-none">ID: {item.uuid}</span>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-5 w-5 text-white/20 hover:text-white rounded shrink-0"
                                                                onClick={(e) => { e.stopPropagation(); handleCopy(item.uuid); }}
                                                            >
                                                                {copiedId === item.uuid ? <Check className="h-2.5 w-2.5 text-green-400" /> : <Copy className="h-2.5 w-2.5" />}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
