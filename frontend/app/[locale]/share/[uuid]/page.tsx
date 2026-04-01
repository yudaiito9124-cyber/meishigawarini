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
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Gift, ShoppingBasket, Store, CreditCard } from "lucide-react";
import { receiveApi } from "@/lib/api/receive";
import SandboxedHtml from "@/components/SandboxedHtml";
import { cn } from "@/lib/utils";

export default function SharePage() {
    const t = useTranslations('ReceivePage');
    const params = useParams();
    const searchParams = useSearchParams();
    const uuid = params?.uuid as string;

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    // オプションの取得 (パラメータが存在するかどうかで判定)
    const showProduct = searchParams.has('product');
    const showCard = searchParams.has('card');
    const showShop = searchParams.has('shop');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await receiveApi.share_get(uuid);
                setData(res);
            } catch (err: any) {
                console.error(err);
                setError(err.message || "Failed to load share information.");
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [uuid]);

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
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-emerald-600 rounded-xl shadow-lg shadow-emerald-200">
                        <Gift className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-xl font-black tracking-tighter text-slate-800">名刺代わりに。</span>
                </div>
            </div>

            <main className="max-w-2xl mx-auto px-6 space-y-10">
                
                {/* Hero Message */}
                <div className="text-center space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-1000">
                    <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight leading-tight">
                        素敵なギフトが<br />届きました！
                    </h2>
                    <p className="text-slate-500 font-medium">
                        「名刺代わりに。」を通じて贈られた特別な一品です。
                    </p>
                </div>

                {/* Card Design Section */}
                {showCard && data.design && (
                    <section className="animate-in fade-in zoom-in-95 duration-1000 delay-300">
                        <div className="flex items-center gap-2 mb-4 px-2">
                            <CreditCard className="w-4 h-4 text-emerald-600" />
                            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Digital Card</h3>
                        </div>
                        <div className="relative aspect-[84/52] w-full perspective-2000 group">
                            <Card className="w-full h-full overflow-hidden rounded-[2rem] border-none shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] transition-transform duration-700 group-hover:-translate-y-2 group-hover:rotate-x-2">
                                {data.design.thumbf ? (
                                    <img 
                                        src={data.design.thumbf} 
                                        alt="Card Design" 
                                        className="w-full h-full object-cover" 
                                        crossOrigin="anonymous"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-slate-200 flex items-center justify-center">
                                        <Gift className="w-12 h-12 text-slate-400" />
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
                            </Card>
                        </div>
                    </section>
                )}

                {/* Product Section */}
                {showProduct && data.product && (
                    <section className="animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-500">
                        <div className="flex items-center gap-2 mb-4 px-2">
                            <ShoppingBasket className="w-4 h-4 text-emerald-600" />
                            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Gift Item</h3>
                        </div>
                        <Card className="overflow-hidden rounded-[2.5rem] border-none shadow-[0_20px_50px_-12px_rgba(0,0,0,0.08)] bg-white">
                            <div className="p-8 md:p-10 space-y-8">
                                <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
                                    {data.product.image_url && (
                                        <div className="w-full md:w-48 aspect-square rounded-3xl overflow-hidden shadow-xl ring-8 ring-slate-50 shrink-0">
                                            <img 
                                                src={data.product.image_url} 
                                                alt={data.product.name} 
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                    )}
                                    <div className="flex-1 text-center md:text-left space-y-3">
                                        <h4 className="text-2xl md:text-3xl font-black text-slate-900 leading-tight">
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
                        <div className="flex items-center gap-2 mb-4 px-2">
                            <Store className="w-4 h-4 text-emerald-600" />
                            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Managed By</h3>
                        </div>
                        <Card className="overflow-hidden rounded-[2rem] border-none shadow-[0_10px_30px_-5px_rgba(0,0,0,0.05)] bg-[#1e293b] text-white">
                            <div className="p-8 md:p-10">
                                <div className="space-y-6">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">Shop Identity</p>
                                        <h4 className="text-xl md:text-2xl font-black tracking-tight">{data.shop.name}</h4>
                                    </div>
                                    
                                    {data.shop.detail_html && (
                                        <div className="text-slate-300 text-sm font-medium leading-relaxed opacity-90 border-t border-white/5 pt-6">
                                            <SandboxedHtml html={data.shop.detail_html} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Card>
                    </section>
                )}

                {/* Footer Message */}
                <div className="pt-16 pb-10 text-center space-y-6 border-t border-slate-200/60 transition-all duration-1000 animate-in fade-in slide-in-from-bottom-4 delay-1000">
                    <div className="inline-flex items-center gap-2 text-slate-400 animate-bounce">
                        <Gift className="w-4 h-4" />
                    </div>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-[0.2em]">
                        Presented by Meishigawarini.
                    </p>
                </div>
            </main>
        </div>
    );
}
