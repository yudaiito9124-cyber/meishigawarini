/**
 * ファイル概要: ギフト受取体験共有ダイアログ (Gift Experience Share Dialog)
 * 
 * 役割:
 * 受取人がギフトを受け取った際の感動を、SNS（X, LINE）やリンクコピーで共有するための
 * インタラクティブなダイアログを提供します。
 * 
 * 主要機能:
 * 1. シェア用 URL の動的生成（表示項目のカスタマイズ対応）。
 * 2. ビジュアルプレビュー（OGP プレビューを模したアニメーション）。
 * 3. SNS 連携（X, LINE）。
 * 4. クリップボードへのコピー & 紙吹雪エフェクト (canvas-confetti)。
 * 5. OS 標準のシェア機能 (Web Share API) との連携。
 */

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Share2, Copy, Check, Gift, Sparkles } from "lucide-react";
import { SiX, SiLine } from "@icons-pack/react-simple-icons";
import { cn } from "@/lib/utils";
import confetti from "canvas-confetti";

/**
 * ShareDialog のプロパティ
 * @property qr_id 共有対象のギフト識別子
 * @property product 共有に含める商品情報
 * @property card 共有に含めるカードデザイン情報
 * @property shop 共有に含めるショップ情報
 */
interface ShareDialogProps {
    qr_id: string;
    product?: {
        name: string;
        image_url: string;
    };
    card?: {
        image_url: string;
    };
    shop?: {
        name: string;
    };
}

/**
 * 共有ダイアログコンポーネント
 */
export function ShareDialog({ qr_id, product, card, shop }: ShareDialogProps) {
    /** 多言語対応用 (ReceivePage.share セクション) */
    const t = useTranslations('ReceivePage.share');

    // ─── 共有設定の状態管理 ───
    const [includeProduct, setIncludeProduct] = useState(true);
    const [includeCard, setIncludeCard] = useState(true);
    const [includeShop, setIncludeShop] = useState(true);
    const [copied, setCopied] = useState(false);

    /** 現在のベース URL (window オブジェクトから取得) */
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    
    /** 
     * URL パスから現在のロケール (ja/en等) を判定。
     * 未判定時はデフォルト 'ja' を使用。
     */
    const localeMatch = typeof window !== 'undefined' ? window.location.pathname.match(/^\/([a-z]{2})\//) : null;
    const locale = localeMatch ? localeMatch[1] : 'ja';

    /**
     * 設定に基づいたシェア用 URL を生成します。
     * クエリパラメータでフロントエンドでの表示制限を制御します。
     */
    const generateShareUrl = () => {
        const url = new URL(`${baseUrl}/${locale}/share/${qr_id}`);
        const params: string[] = [];
        if (includeProduct) params.push('product');
        if (includeCard) params.push('card');
        if (includeShop) params.push('shop');

        const queryString = params.length > 0 ? `?${params.join('&')}` : '';
        return `${url.origin}${url.pathname}${queryString}`;
    };

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ─── シェアアクション ──────────────────────────────────────────────────────────
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /** リンクをコピーし、お祝いの紙吹雪を演出します。 */
    const handleCopy = () => {
        navigator.clipboard.writeText(generateShareUrl());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        
        // 紙吹雪エフェクト
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
        });
    };

    /** X (旧Twitter) で共有します。 */
    const handleShareX = () => {
        const text = encodeURIComponent(`素敵なギフトをもらいました！🎁✨ #名刺代わりに #ギフト`);
        const url = encodeURIComponent(generateShareUrl());
        window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
    };

    /** LINE で共有します。 */
    const handleShareLine = () => {
        const url = encodeURIComponent(generateShareUrl());
        window.open(`https://social-plugins.line.me/lineit/share?url=${url}`, '_blank');
    };

    /** OS 標準のシェアメニューを呼び出します (モバイル推奨)。 */
    const handleNativeShare = async () => {
        try {
            await navigator.share({
                title: "名刺代わりに。",
                text: "素敵なギフトが届きました！🎁✨",
                url: generateShareUrl(),
            });
        } catch (err) {
            // ユーザーキャンセル、または未サポート
        }
    };

    /** Web Share API が利用可能かどうかの判定 */
    const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ─── レンダリング ────────────────────────────────────────────────────────────
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    return (
        <Dialog>
            {/* トリガーボタン: プレミアムなグラデーションとアニメーション */}
            <DialogTrigger asChild>
                <Button
                    className="w-full h-14 text-lg font-black rounded-2xl shadow-[0_10px_30px_-5px_rgba(0,0,0,0.2)] hover:shadow-[0_15px_40px_-5px_rgba(0,0,0,0.3)] transition-all transform hover:-translate-y-1 active:scale-95 bg-gradient-to-r from-emerald-500 to-teal-600 border-none group overflow-hidden"
                >
                    <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.2)_50%,transparent_75%)] bg-[length:250%_250%] animate-shine pointer-events-none" />
                    <Share2 className="mr-2 h-6 w-6 group-hover:rotate-12 transition-transform" />
                    {t('buttonDesc')}
                </Button>
            </DialogTrigger>

            {/* ダイアログ本体: Glassmorphism / 高い角丸デザイン */}
            <DialogContent className="sm:max-w-md bg-white/95 backdrop-blur-xl border-none shadow-2xl rounded-[2rem] overflow-y-auto">
                {/* 頂上のアクセントバー */}
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-400" />

                <DialogHeader className="pt-4">
                    <DialogTitle className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2 justify-center flex-col">
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-6 h-6 text-amber-500 animate-pulse" />
                            {t('title')}
                        </div>
                        <span className="text-amber-500 font-bold text-md bg-amber-500/10 px-2 py-1 rounded-full border border-amber-300">
                            {t('title2')}
                        </span>
                    </DialogTitle>
                    <DialogDescription className="text-center font-medium text-slate-500 pt-1">
                        {t('description')}
                    </DialogDescription>
                </DialogHeader>

                <div className="p-2 space-y-4">
                    {/* ビジュアルプレビュー: シェア時の見え方をカードのアニメーションで表現 */}
                    <div className="relative aspect-video w-full bg-slate-50 rounded-3xl overflow-hidden border border-slate-100 shadow-inner group">
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/50 via-transparent to-teal-50/50" />

                        <div className="absolute inset-0 flex items-center justify-center p-4">
                            {/* 背景のグローエフェクト */}
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4/5 h-4/5 bg-emerald-500/10 blur-[60px] rounded-full animate-pulse" />

                            {/* カードイメージの重なり表現 (背面) */}
                            <div className={cn(
                                "absolute w-[60%] aspect-[84/52] bg-white rounded-xl shadow-2xl transition-all duration-700 transform rotate-[-8deg] -translate-x-1/4 -translate-y-1/8 overflow-hidden z-10",
                                !includeCard && "opacity-0 scale-90 -translate-y-4"
                            )}>
                                {card?.image_url ? (
                                    <img src={card.image_url} alt="Card" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-slate-100"><Gift className="w-8 h-8 text-slate-300" /></div>
                                )}
                            </div>

                            {/* 商品イメージの重なり表現 (前面) */}
                            <div className={cn(
                                "absolute w-[50%] aspect-square bg-white rounded-2xl shadow-2xl transition-all duration-700 transform rotate-[10deg] translate-x-1/4 translate-y-1/8 overflow-hidden z-20 border-4 border-white",
                                !includeProduct && "opacity-0 scale-90 translate-y-4"
                            )}>
                                {product?.image_url ? (
                                    <img src={product.image_url} alt="Product" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-slate-100"><Gift className="w-10 h-10 text-slate-300" /></div>
                                )}
                            </div>
                        </div>

                        {/* ブランドバッジ */}
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur-md px-3 py-1 rounded-full border border-white shadow-sm flex items-center gap-1.5 z-30">
                            <Gift className="w-3 h-3 text-emerald-600" />
                            <span className="text-[10px] font-black tracking-tighter text-slate-800">名刺代わりに。</span>
                        </div>
                    </div>

                    {/* シェア設定（トグルスイッチ） */}
                    <div className="grid grid-cols-1 gap-2 px-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{t('options.title')}</p>

                        <div className="flex items-center justify-between py-2 px-3 bg-slate-50/50 rounded-2xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-slate-700">{t('options.product')}</span>
                                <span className="text-[10px] text-slate-400 font-medium truncate max-w-[150px]">{product?.name || "---"}</span>
                            </div>
                            <Switch checked={includeProduct} onCheckedChange={setIncludeProduct} />
                        </div>

                        <div className="flex items-center justify-between py-2 px-3 bg-slate-50/50 rounded-2xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-slate-700">{t('options.card')}</span>
                            </div>
                            <Switch checked={includeCard} onCheckedChange={setIncludeCard} />
                        </div>

                        <div className="flex items-center justify-between py-2 px-3 bg-slate-50/50 rounded-2xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-slate-700">{t('options.shop')}</span>
                                <span className="text-[10px] text-slate-400 font-medium truncate max-w-[150px]">{shop?.name || "---"}</span>
                            </div>
                            <Switch checked={includeShop} onCheckedChange={setIncludeShop} />
                        </div>
                        <p className="text-[8px] text-center font-black uppercase tracking-[0.2em] text-slate-400 mb-1">{t('options.description')}</p>
                    </div>

                    {/* シェアボタン群 */}
                    <div className="space-y-4 pt-2">
                        <div className="flex gap-3">
                            <Button
                                onClick={handleShareX}
                                className="flex-1 h-14 rounded-2xl bg-[#000000] hover:bg-slate-800 text-white font-black text-base gap-3 shadow-lg shadow-black/10"
                            >
                                <SiX className="w-5 h-5" />
                                {t('x')}
                            </Button>
                            <Button
                                onClick={handleShareLine}
                                className="flex-1 h-14 rounded-2xl bg-[#06C755] hover:bg-[#05b14c] text-white font-black text-base gap-3 shadow-lg shadow-emerald-100"
                            >
                                <SiLine className="w-6 h-6" />
                                {t('line')}
                            </Button>
                        </div>

                        <div className="flex gap-2">
                            {/* コピーボタン: フィードバックアニメーション付き */}
                            <Button
                                variant="outline"
                                onClick={handleCopy}
                                className={cn(
                                    "flex-1 h-14 rounded-2xl border-2 font-black text-base gap-3 transition-all",
                                    copied ? "bg-emerald-50 border-emerald-500 text-emerald-600" : "bg-white border-slate-100 text-slate-600 hover:bg-slate-50"
                                )}
                            >
                                {copied ? (
                                    <>
                                        <Check className="w-5 h-5 animate-bounce" />
                                        {t('copied')}
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-5 h-5 text-slate-400 group-hover:text-emerald-500" />
                                        {t('copyLink')}
                                    </>
                                )}
                            </Button>

                            {/* ネイティブシェア（環境により表示） */}
                            {canNativeShare && (
                                <Button
                                    variant="outline"
                                    onClick={handleNativeShare}
                                    size="icon"
                                    className="h-14 w-14 rounded-2xl border-2 border-slate-100 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-200 transition-all shrink-0"
                                >
                                    <Share2 className="w-5 h-5" />
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="pb-6 pt-2 text-center">
                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em]">{t('description')}</p>
                </div>
            </DialogContent>
        </Dialog>
    );
}

