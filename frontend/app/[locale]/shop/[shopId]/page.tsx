/**
 * ファイル概要: 個別ショップ管理ダッシュボード
 * 
 * 役割:
 * 特定のショップ（店舗）に関連する管理機能を集約したハブページです。
 * 商品管理、受注（発送）管理、カードのアクティベーション（紐付け）、
 * および物理カードの発注機能など、実務に必要な機能をタブ形式で提供します。
 * 
 * 状態管理:
 * - ShopProvider: ショップ固有のコンテキスト情報を子コンポーネント全体へ提供。
 * - activeTab: 現在表示中の管理セクションを制御。
 */

'use client';

import { useState } from 'react';
import { QrCode, Truck, Gift, CreditCard } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CardActivationSection } from '@/components/shop/CardActivationSection';
import { CardListSection } from '@/components/shop/CardListSection';
import { ProductsSection } from '@/components/shop/ProductsSection';
import { OrderCardSection } from '@/components/shop/OrderCardSection';
import { ShopHeader } from '@/components/shop/ShopHeader';
import { ShopProvider } from '@/context/ShopContext';

/**
 * ショップ管理ページコンポーネント
 */
export default function ShopPage() {
    /** 翻訳用フック */
    const t = useTranslations('ShopPage');
    const params = useParams();
    
    /** 
     * URLパラメータから shopId を抽出 
     * 配列形式で返される可能性を考慮した正規化
     */
    const shopId = (Array.isArray(params.shopId) ? params.shopId[0] : params.shopId) as string;

    /** 現在選択中のタブ状態 ('activation' | 'shipping' | 'products' | 'orderCard') */
    const [activeTab, setActiveTab] = useState("activation");

    return (
        <ShopProvider shopId={shopId}>
            <div className="min-h-screen bg-gray-50 pb-12">
                <ShopHeader shopId={shopId} />

                <div className="max-w-7xl mx-auto px-4 sm:px-8 py-4 sm:py-8 space-y-6">

                    {/* --- 管理機能切り替えタブ (モバイル時はグリッド2列) --- */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                        <button
                            onClick={() => setActiveTab("activation")}
                            className={`flex flex-col items-center justify-center p-4 sm:p-6 rounded-2xl border-2 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md 
                                ${activeTab === "activation"
                                    ? "bg-white border-white text-gray-900 ring-2 ring-gray-700 ring-offset-2"
                                    : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                                }`}
                        >
                            <QrCode className={`w-8 h-8 sm:w-10 sm:h-10 mb-2 sm:mb-3 ${activeTab === "activation" ? "text-gray-900" : "text-gray-400"}`} />
                            <span className="text-sm sm:text-lg font-bold">{t('tabs.activation')}</span>
                        </button>
                        <button
                            onClick={() => setActiveTab("shipping")}
                            className={`flex flex-col items-center justify-center p-4 sm:p-6 rounded-2xl border-2 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md 
                                ${activeTab === "shipping"
                                    ? "bg-white border-white text-gray-900 ring-2 ring-gray-700 ring-offset-2"
                                    : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                                }`}
                        >
                            <Truck className={`w-8 h-8 sm:w-10 sm:h-10 mb-2 sm:mb-3 ${activeTab === "shipping" ? "text-gray-900" : "text-gray-400"}`} />
                            <span className="text-sm sm:text-lg font-bold">{t('tabs.shipping')}</span>
                        </button>
                        <button
                            onClick={() => setActiveTab("products")}
                            className={`flex flex-col items-center justify-center p-4 sm:p-6 rounded-2xl border-2 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md 
                                ${activeTab === "products"
                                    ? "bg-white border-white text-gray-900 ring-2 ring-gray-700 ring-offset-2"
                                    : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                                }`}
                        >
                            <Gift className={`w-8 h-8 sm:w-10 sm:h-10 mb-2 sm:mb-3 ${activeTab === "products" ? "text-gray-900" : "text-gray-400"}`} />
                            <span className="text-sm sm:text-lg font-bold">{t('tabs.products')}</span>
                        </button>
                        <button
                            onClick={() => setActiveTab("orderCard")}
                            className={`flex flex-col items-center justify-center p-4 sm:p-6 rounded-2xl border-2 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md 
                                ${activeTab === "orderCard"
                                    ? "bg-white border-white text-gray-900 ring-2 ring-gray-700 ring-offset-2"
                                    : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                                }`}
                        >
                            <CreditCard className={`w-8 h-8 sm:w-10 sm:h-10 mb-2 sm:mb-3 ${activeTab === "orderCard" ? "text-gray-900" : "text-gray-400"}`} />
                            <span className="text-sm sm:text-lg font-bold">{t('tabs.orderCard')}</span>
                        </button>
                    </div>

                    {/* --- アクティベーション（QR紐付け）セクション --- */}
                    {activeTab === 'activation' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <CardActivationSection shopId={shopId as string} />
                        </div>
                    )}

                    {/* --- 発送管理（受注リスト）セクション --- */}
                    {activeTab === 'shipping' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <CardListSection shopId={shopId as string} />
                        </div>
                    )}

                    {/* --- 商品管理（ギフトアイテム）セクション --- */}
                    {activeTab === 'products' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <ProductsSection shopId={shopId as string} />
                        </div>
                    )}

                    {/* --- カード発注（資材注文）セクション --- */}
                    {activeTab === 'orderCard' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <OrderCardSection shopId={shopId as string} />
                        </div>
                    )}

                </div>
            </div>
        </ShopProvider>
    );
}
