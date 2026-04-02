/**
 * 概要: ギフトシェア用公開ページ
 * 詳細: 
 *  - PIN認証なしで、ギフトの情報を閲覧できるページです。
 *  - URLパラメータ (?product, ?card, ?shop) によって表示内容を制御します。
 *  - セキュリティのため、送り主(Sender)の個人情報やチャット、配送先情報は一切表示しません。
 */
"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Gift, ShoppingBasket, Store, CreditCard } from "lucide-react";
import { receiveApi } from "@/lib/api/receive";
import SandboxedHtml from "@/components/SandboxedHtml";
import { cn } from "@/lib/utils";

export default function SharePage() {
    const t = useTranslations('ReceivePage');
    const params = useParams();
    const searchParams = useSearchParams();
    const qr_id = params?.qr_id as string;

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [isFlipped, setIsFlipped] = useState(false);

    // オプションの取得 (パラメータが存在するかどうかで判定)
    const showProduct = searchParams.has('product');
    const showCard = searchParams.has('card');
    const showShop = searchParams.has('shop');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await receiveApi.share_get(qr_id);
                setData(res);
            } catch (err: any) {
                console.error(err);
                setError(err.message || "Failed to load share information.");
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [qr_id]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="w-10 h-10 animate-spin text-emerald-600" />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
                <div className="p-4 bg-red-50 rounded-full mb-4">
                    <Gift className="w-12 h-12 text-red-400" />
                </div>
                <h1 className="text-xl font-bold text-gray-900 mb-2">{error || "Gift not found"}</h1>
                <p className="text-gray-500">このリンクは無効か、有効期限が切れている可能性があります。</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F8FAFC] pb-20 font-sans selection:bg-emerald-100">
            {/* Header / Brand */}
            <div className="w-full py-8 px-6 flex justify-center">
                <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                    <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg shadow-emerald-100/50 flex items-center justify-center">
                        <img src="/presenticon.png" alt="Logo" className="w-full h-full object-cover" />
                    </div>
                    <span className="text-xl font-black tracking-tighter text-slate-800">名刺代わりに。</span>
                </Link>
            </div>

            <main className="max-w-2xl mx-auto px-6 space-y-10">

                {/* Hero Message */}
                <div className="text-center space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-1000">
                    <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight leading-tight">
                        素敵なギフトが届きました！
                    </h2>
                    <p className="text-slate-600 font-semibold text-lg">
                        新たなギフト体験を贈る
                        <Link href="/" className="text-emerald-700 hover:underline inline-flex items-center ml-1 underline-offset-4 decoration-emerald-200">
                            「名刺代わりに。」
                        </Link>
                    </p>
                </div>

                {/* Card Design Section */}
                {showCard && data.design && (
                    <section className="animate-in fade-in zoom-in-95 duration-1000 delay-300">
                        <div className="flex items-center gap-4 mb-6 px-1">
                            <div className="flex items-center gap-4 px-5 py-3.5 rounded-2xl">
                                <div className="flex items-center justify-center w-12 h-12 bg-emerald-600/10 rounded-2xl shrink-0">
                                    <CreditCard className="w-6 h-6 text-emerald-600" />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-900 leading-none">
                                        Card <span className="text-emerald-700">Design</span>
                                    </h3>
                                    <span className="text-xs font-bold text-slate-600 uppercase tracking-widest italic">
                                        オリジナルデザインも制作できます
                                    </span>
                                </div>
                            </div>
                            <div className="h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent" />
                        </div>
                        <div
                            className="relative w-full aspect-[84/52] cursor-pointer group"
                            style={{ perspective: '2000px' }}
                            onMouseEnter={() => setIsFlipped(true)}
                            onMouseLeave={() => setIsFlipped(false)}
                            onClick={() => setIsFlipped(!isFlipped)}
                        >
                            {/* Main Shine/Reflection Layer */}
                            <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden rounded-[2rem] opacity-0 group-hover:opacity-100 transition-opacity duration-1000">
                                <div
                                    className="absolute inset-[-100%] bg-gradient-to-tr from-transparent via-white/10 to-transparent rotate-[25deg] transition-transform duration-[600ms] ease-out-back"
                                    style={{
                                        transform: isFlipped ? 'translateX(20%) translateY(20%)' : 'translateX(-20%) translateY(-20%)',
                                        filter: 'blur(20px)'
                                    }}
                                />
                            </div>

                            {/* Rotating Container */}
                            <div
                                className={cn(
                                    "w-full h-full relative preserve-3d transition-all duration-700 md:duration-1000 rounded-[2rem]",
                                    isFlipped ? "rotate-y-180 -translate-y-2" : "group-hover:-translate-y-2 group-hover:rotate-x-[2deg]"
                                )}
                                style={{
                                    transformStyle: 'preserve-3d',
                                }}
                            >
                                {/* Front Face */}
                                <div
                                    className="absolute inset-0 w-full h-full backface-hidden rounded-[2rem] overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)]"
                                    style={{
                                        backfaceVisibility: 'hidden',
                                        WebkitBackfaceVisibility: 'hidden',
                                        transform: 'translateZ(1px)'
                                    }}
                                >
                                    {data.design.thumbf ? (
                                        <img
                                            src={data.design.thumbf}
                                            alt="Card Design Front"
                                            className="w-full h-full object-cover"
                                            crossOrigin="anonymous"
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-slate-200 flex items-center justify-center">
                                            <Gift className="w-12 h-12 text-slate-400" />
                                        </div>
                                    )}
                                </div>

                                {/* Back Face */}
                                <div
                                    className="absolute inset-0 w-full h-full backface-hidden rounded-[2rem] overflow-hidden bg-indigo-950 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.2)]"
                                    style={{
                                        backfaceVisibility: 'hidden',
                                        WebkitBackfaceVisibility: 'hidden',
                                        transform: 'rotateY(180deg) translateZ(1px)'
                                    }}
                                >
                                    {data.design.thumbb ? (
                                        <img
                                            src={data.design.thumbb}
                                            alt="Card Design Back"
                                            className="w-full h-full object-cover"
                                            crossOrigin="anonymous"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-indigo-900 to-slate-900">
                                            <Gift className="w-12 h-12 text-indigo-400/50 mb-4" />
                                            <p className="text-indigo-200/60 text-[10px] font-black uppercase tracking-[0.2em]">Designed for you</p>
                                        </div>
                                    )}
                                    {/* Decorative Overlay for Back side */}
                                    <div className="absolute inset-0 bg-gradient-to-tr from-black/20 via-transparent to-white/5 pointer-events-none" />
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                {/* Product Section */}
                {showProduct && data.product && (
                    <section className="animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-500">
                        <div className="flex items-center gap-4 mb-6 px-1">
                            <div className="flex items-center gap-4 px-5 py-3.5 rounded-2xl">
                                <div className="flex items-center justify-center w-12 h-12 bg-emerald-600/10 rounded-2xl shrink-0">
                                    <Gift className="w-6 h-6 text-emerald-600" />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-900 leading-none">
                                        Gift <span className="text-emerald-700">Item</span>
                                    </h3>
                                    <span className="text-xs font-bold text-slate-600 uppercase tracking-widest italic">
                                        ギフトの詳細
                                    </span>
                                </div>
                            </div>
                            <div className="h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent" />
                        </div>
                        <Card className="overflow-hidden rounded-[2.5rem] border-none shadow-[0_20px_50px_-12px_rgba(0,0,0,0.08)] bg-white">
                            <div className="p-8 space-y-8 ">
                                <div className="flex flex-col gap-8 items-center ">
                                    {data.product.image_url && (
                                        <div className="w-full rounded-3xl overflow-hidden shadow-xl ring-8 ring-slate-50 shrink-0 bg-white">
                                            <img
                                                src={data.product.image_url}
                                                alt={data.product.name}
                                                className="w-full h-auto block"
                                            />
                                        </div>
                                    )}
                                    <div className="flex-1 text-center space-y-3">
                                        <h4 className="text-2xl  font-black text-slate-900 leading-tight">
                                            {data.product.name}
                                        </h4>
                                        <div className="inline-flex items-center px-4 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold ring-1 ring-emerald-100">
                                            Gift for You
                                        </div>
                                    </div>
                                </div>

                                {data.product.detail_html && (
                                    <div className="pt-8 border-t border-slate-100">
                                        <div className="prose prose-slate max-w-none prose-img:rounded-2xl prose-a:text-emerald-600 font-medium text-slate-600 leading-relaxed">
                                            <SandboxedHtml html={data.product.detail_html} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </Card>
                    </section>
                )}

                {/* Shop Section */}
                {showShop && data.shop && (
                    <section className="animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-700">
                        <div className="flex items-center gap-4 mb-6 px-1">
                            <div className="flex items-center gap-4 px-5 py-3.5 rounded-2xl">
                                <div className="flex items-center justify-center w-12 h-12 bg-emerald-600/10 rounded-2xl shrink-0">
                                    <Store className="w-6 h-6 text-emerald-600" />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-900 leading-none">
                                        Shop <span className="text-emerald-700">Identity</span>
                                    </h3>
                                    <span className="text-xs font-bold text-slate-600 uppercase tracking-widest italic">
                                        ギフトを配送したショップ
                                    </span>
                                </div>
                            </div>
                            <div className="h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent" />
                        </div>
                        <Card className="overflow-hidden rounded-[2rem] border-none shadow-[0_10px_30px_-5px_rgba(0,0,0,0.05)] bg-[#1e293b] text-white">
                            <div className="p-8 md:p-10">
                                <div className="space-y-6">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">Shop Identity</p>
                                        <h4 className="text-xl md:text-2xl font-black tracking-tight">{data.shop.name}</h4>
                                    </div>

                                    {data.shop.detail_html && (
                                        <div className="text-slate-200 text-sm font-medium leading-relaxed opacity-100 border-t border-white/10 pt-6">
                                            <SandboxedHtml html={data.shop.detail_html} darkMode />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Card>
                    </section>
                )}

                {/* Footer Message */}
                <div className="pt-16 pb-10 text-center space-y-6 border-t border-slate-200/60 transition-all duration-1000 animate-in fade-in slide-in-from-bottom-4 delay-1000">
                    <Link href="/" className="block group">
                        <div className="w-8 h-8 rounded-lg overflow-hidden shadow-sm animate-bounce mx-auto mb-4 group-hover:scale-110 transition-transform">
                            <img src="/presenticon.png" alt="Logo" className="w-full h-full object-cover" />
                        </div>
                        <p className="text-sm font-bold text-slate-400 uppercase tracking-[0.2em] group-hover:text-emerald-600 transition-colors">
                            Presented by Meishigawarini.
                        </p>
                    </Link>
                </div>
            </main>
        </div>
    );
}
