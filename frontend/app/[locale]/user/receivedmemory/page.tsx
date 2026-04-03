"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Inbox, ChevronDown, ExternalLink, Copy, Check, LayoutGrid, Layers } from "lucide-react";
import { userApi } from "@/lib/api/user";
import { cn } from "@/lib/utils";

export default function ReceivedHistoryPage() {
    const t = useTranslations('UserProfilePage');
    const router = useRouter();

    const [activeId, setActiveId] = useState<string | null>(null);
    const [activeStage, setActiveStage] = useState<'peek' | 'flipped' | 'none'>('none');
    const [viewMode, setViewMode] = useState<'grid' | 'stack'>('stack');
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    const handleItemClick = (id: string) => {
        if (activeId === id) {
            if (activeStage === 'peek') {
                setActiveStage('flipped');
            } else {
                setActiveId(null);
                setActiveStage('none');
            }
        } else {
            setActiveId(id);
            setActiveStage('peek');
        }
    };

    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState<Array<{
        qr_id: string,
        timestamp: string,
        pin?: string,
        product_name?: string,
        product_image_url?: string,
        thumbf?: string,
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
        <div className="min-h-screen bg-slate-50 flex flex-col items-center py-12 px-4 text-gray-900 font-sans">
            <div className="w-full max-w-4xl flex justify-start mb-6">
                <Button
                    variant="outline"
                    className="rounded-full bg-white/50 backdrop-blur-sm border-gray-200 text-gray-500 hover:text-gray-900"
                    onClick={() => router.push('/user')}
                >
                    <ChevronDown className="h-4 w-4 mr-1 rotate-90" /> {t('back')}
                </Button>
            </div>

            <div className="w-full max-w-4xl mb-12">
                <div className="bg-gradient-to-r from-purple-500 to-indigo-600 p-10 text-white rounded-[2rem] shadow-xl flex flex-col gap-4">
                    <div className="flex flex-row items-center justify-between gap-4">
                        <div className="flex flex-row items-center gap-4">
                            <div className="p-3 bg-white/20 rounded-2xl shadow-inner backdrop-blur-md">
                                <Inbox className="w-8 h-8 text-white" />
                            </div>
                            <div>
                                <CardTitle className="text-3xl font-black tracking-tight">{t('receiveList')}</CardTitle>
                                <p className="text-purple-100/80 text-sm font-bold uppercase tracking-widest mt-1">{t('receiveListDesc')}</p>
                            </div>
                        </div>

                        {/* View Toggle */}
                        <div className="flex bg-black/20 p-1 rounded-xl backdrop-blur-md border border-white/10">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white text-purple-600 shadow-lg' : 'text-white/60 hover:text-white'}`}
                                title="Grid View"
                            >
                                <LayoutGrid className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => setViewMode('stack')}
                                className={`p-2 rounded-lg transition-all ${viewMode === 'stack' ? 'bg-white text-purple-600 shadow-lg' : 'text-white/60 hover:text-white'}`}
                                title="Stack View"
                            >
                                <Layers className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="w-full max-w-4xl">
                {loading ? (
                    <div className="flex items-center justify-center p-16">
                        <Loader2 className="w-10 h-10 animate-spin text-purple-500" />
                    </div>
                ) : history.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-16 text-center text-gray-400 bg-white/50 backdrop-blur-xl rounded-[2rem] border border-white/20">
                        <div className="p-6 bg-gray-50 rounded-full mb-4">
                            <Inbox className="w-12 h-12 text-gray-200" />
                        </div>
                        <p className="font-bold uppercase tracking-widest text-xs">{t('noReceivedHistory')}</p>
                    </div>
                ) : (
                    <div className={viewMode === 'grid'
                        ? "grid grid-cols-1 md:grid-cols-2 gap-10 p-10"
                        : "flex flex-col items-center w-full max-w-xl mx-auto space-y-0 pb-32 pt-0"
                    }>
                        {activeId && (
                            <div
                                className="fixed inset-0 z-10 bg-transparent cursor-default"
                                onClick={(e) => {
                                    setActiveId(null);
                                    setActiveStage('none');
                                }}
                            />
                        )}
                        {history.map((item, index) => {
                            const isPeeked = activeId === item.qr_id && activeStage === 'peek';
                            const isFlipped = activeId === item.qr_id && activeStage === 'flipped';
                            const isActive = isPeeked || isFlipped;
                            const isHovered = hoveredId === item.qr_id && !isActive;
                            const isFixedGrid = isActive && viewMode === 'grid';

                            const wrapperStyle = viewMode === 'stack' ? {
                                marginTop: index === 0 ? '0' : '-40%',
                                // Stack cards start at z-20. Backdrop is z-10.
                                zIndex: isActive ? 500 : 20 + (history.length - index),
                            } : {
                                zIndex: isActive ? 500 : 20,
                            };

                            const stackTransformStyle = viewMode === 'stack' ? {
                                transform: `
                                    rotate(${(index % 2 === 0 ? 1 : -1) * (index * 0.5)}deg)
                                    ${isActive ? 'translateY(-50%)' : (isHovered ? 'translateY(1px)' : '')} 
                                    scale(${isActive ? 1.05 : (isHovered ? 1.0 : 1)})
                                `,
                            } : {};

                            const gridFixedStyle = isFixedGrid ? {
                                position: 'fixed' as const,
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%) scale(1.0)',
                                width: 'min(95vw, 600px)',
                                zIndex: 1000,
                            } : {};

                            return (
                                <div
                                    key={item.qr_id}
                                    className="relative aspect-[84/52] w-full transition-all duration-5 pointer-events-none"
                                    style={wrapperStyle}
                                >
                                    <div
                                        className={cn(`group relative aspect-[84/52] w-full cursor-pointer transition-all rounded-3xl pointer-events-auto select-none`, viewMode === "grid" ? "duration-0" : "duration-1000")}
                                        style={{
                                            perspective: '1400px',
                                            transformStyle: 'preserve-3d',
                                            ...stackTransformStyle,
                                            ...gridFixedStyle
                                        }}
                                        onClick={() => handleItemClick(item.qr_id)}
                                        onMouseEnter={() => setHoveredId(item.qr_id)}
                                        onMouseLeave={() => setHoveredId(null)}
                                    >
                                        {/* Main Shine/Reflection Layer */}
                                        <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                                            <div
                                                className="absolute inset-[-100%] bg-gradient-to-tr from-transparent via-white/[0.00] to-transparent rotate-[25deg] transition-transform duration-[500ms] ease-out-back"
                                                style={{
                                                    transform: isFlipped ? 'translateX(20%) translateY(20%)' : 'translateX(-20%) translateY(-20%)',
                                                    filter: 'blur(20px)'
                                                }}
                                            />
                                            {/* Surface Gloss */}
                                            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.00] via-transparent to-transparent" />
                                        </div>

                                        {/* The rotating container */}
                                        <div
                                            className={`w-full h-full relative preserve-3d transition-all duration-700 md:duration-700 rounded-2xl ${isFlipped ? 'rotate-y-180 scale-[1.03]' : (isActive ? 'scale-[1.02]' : '')
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
                                                <Card className="w-full h-full p-0 border-b-[6px] border-indigo-950/40 bg-slate-100 rounded-2xl overflow-hidden border-none shadow-none">
                                                    <CardContent className="p-0 h-full relative rounded-2xl overflow-hidden">
                                                        {/* Card Design Image */}
                                                        <div className="absolute inset-0 w-full h-full pointer-events-none rounded-2xl overflow-hidden">
                                                            {item.thumbf ? (
                                                                <img
                                                                    src={item.thumbf}
                                                                    alt="Card Design"
                                                                    className="w-full h-full object-cover"
                                                                    crossOrigin="anonymous"
                                                                    draggable={false}
                                                                />
                                                            ) : (
                                                                <div className="w-full h-full bg-slate-200/80 flex items-center justify-center">
                                                                    <Inbox className="w-12 h-12 text-slate-400/50" />
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Overlays (Decorative) */}
                                                        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-5 pointer-events-none" />

                                                        {/* Floating Info Panel */}
                                                        <div className="absolute bottom-2 inset-x-5 py-1 px-4 bg-black/50 backdrop-blur-xl border border-white/20 rounded-2xl flex items-center justify-between pointer-events-none z-10 shadow-xl">
                                                            <div className="flex items-center gap-3 overflow-hidden">
                                                                {item.product_image_url && (
                                                                    <div className="w-10 h-10 rounded-lg overflow-hidden border border-white/20 shadow-lg shrink-0">
                                                                        <img
                                                                            src={item.product_image_url}
                                                                            alt=""
                                                                            className="w-full h-full object-cover"
                                                                            draggable={false}
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
                                                <Card className="w-full h-full p-0 border-b-4 border-indigo-950 bg-indigo-950 rounded-2xl shadow-2xl overflow-hidden">
                                                    <CardContent className="p-6 h-full flex flex-col text-white border-2 border-white/10 rounded-2xl">
                                                        {/* Top Section */}
                                                        <div className="pointer-events-none">
                                                            {item.shop_name ? (
                                                                <p className="text-[9px] text-purple-300 text-center font-black uppercase tracking-[0.2em] leading-none">{item.shop_name}</p>
                                                            ) : (
                                                                <div className="h-[9px]" />
                                                            )}
                                                        </div>

                                                        {/* Center Section: PIN */}
                                                        <div className="flex-1 flex items-center justify-center py-2">
                                                            {item.pin && (
                                                                <div className="w-full relative flex items-center justify-center p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 transition-all min-h-[80px]">
                                                                    <div className="flex flex-col items-center pointer-events-none">
                                                                        <span className="text-[15px] font-black text-purple-300/40 uppercase tracking-widest leading-none mb-1">PIN</span>
                                                                        <span className="text-[32px] font-mono font-black text-white tracking-[0.3em] leading-none">{item.pin}</span>
                                                                    </div>
                                                                    <div className="absolute right-3">
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="h-10 w-10 text-purple-300/50 hover:text-white hover:bg-white/10 rounded-lg shrink-0"
                                                                            onClick={(e) => { e.stopPropagation(); handleCopy(item.pin!); }}
                                                                        >
                                                                            {copiedId === item.pin ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Bottom Section */}
                                                        <div className="flex flex-col items-center gap-3">
                                                            <Button
                                                                className="rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-[20px] uppercase tracking-[0.1em] shadow-xl gap-2 group/btn shrink-0 p-3"
                                                                onClick={(e) => { e.stopPropagation(); window.open(`/receive/${item.qr_id}`, '_blank'); }}
                                                            >
                                                                {t('opencard')}
                                                                <ExternalLink className="!w-6 !h-6 transition-transform group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5" />
                                                            </Button>

                                                            {/* ID Row */}
                                                            <div className="flex items-center gap-1.5 opacity-30 hover:opacity-100 transition-opacity">
                                                                <span className="text-[8px] font-mono font-bold text-white/50 truncate tracking-tighter pointer-events-none">ID: {item.qr_id}</span>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-5 w-5 text-white/20 hover:text-white rounded shrink-0"
                                                                    onClick={(e) => { e.stopPropagation(); handleCopy(item.qr_id); }}
                                                                >
                                                                    {copiedId === item.qr_id ? <Check className="h-2.5 w-2.5 text-green-400" /> : <Copy className="h-2.5 w-2.5" />}
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            </div>
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
