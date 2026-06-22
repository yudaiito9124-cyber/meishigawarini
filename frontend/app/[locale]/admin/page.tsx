/**
 * ファイル概要: システム管理者向け統合ダッシュボード (Admin Dashboard)
 * 
 * 役割:
 * システム全体の運用・管理を一括して行うための管理者専用画面です。
 * 主にQRコードのバッチ生成、注文管理（Card Orders）、デザイン管理、ショップ権限管理、
 * およびデバッグ用のデータダンプツールを提供します。
 * 
 * 主要機能:
 * 1. QRコードの生成とエクスポート（PDF/CSV）。
 * 2. カード注文（印刷依頼）のステータス管理とワークフロー。
 * 3. 任意のQRコード・ユーザー・ショップのステータス確認とBAN/復元処理。
 * 4. ショップに対するカードデザインの割当。
 * 5. 新規ショップ作成、オーナー変更、マネージャー紐付け。
 * 6. システムデバッグ用のDynamoDBデータダンプ。
 * 
 * セキュリティ:
 * このページへのアクセスは Amplify の Cognito グループ (Administrators/GlobalAdmins) 
 * によってバックエンド側でも厳格に制限されています。
 */

"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { notFound, useParams } from "next/navigation";
import { getCurrentUser, fetchAuthSession, signOut } from 'aws-amplify/auth';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { APP_CONFIG } from "@/lib/config";
import { generateId } from '@/lib/id';
import { useTranslations } from 'next-intl';
import { useBackendError } from '@/hooks/useBackendError';
import { generatePDF } from '@/lib/generatePDF';
import { cardformats, paperformats } from '@/lib/constants/designs';
import { generateCSVExport } from '@/lib/generateCSVExport';
import { ExternalLink, Copy, Check, Eye, QrCode, Store, Wrench, Layers, HelpCircle, Home, Trash2, RotateCcw, Loader2, Plus, X, Search, Save, FileText, Download, CreditCard, Printer, Paintbrush, ChevronDown, Settings, LogOut, Calendar } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import CardDesignEditor from "@/components/admin/CardDesignEditor";
const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";
// const PDF_PAPER_FORMAT = "51677E-1.036"; //"1S31034"
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
import { isValidWorkflowPayload } from '@shared/unified-chat-workflows';

import { adminApi } from "@/lib/api/admin";
import { uploadChatFile, ChatFileData } from '@/lib/uploadChatFile';
import { getDisplayMessage } from '@/lib/chatMessage';
import { toDisplayParticipantId } from '@/lib/chatId';
import ChatAttachment from '@/components/chat/ChatAttachment';
import OrderDetailsDialog from "@/components/admin/OrderDetailsDialog";
import { AdminSettingsSection } from "@/components/admin/AdminSettingsSection";

/**
 * SHOP_OPENING の form_snapshot を厳格に検証する type guard。
 *
 * 背景:
 * - DBには過去バージョン由来の余分なキーや欠損データが混在する可能性があります。
 * - 管理画面では承認処理時にこのスナップショットをそのまま表示・利用するため、
 *   予期しない形状を受け入れない方針にしています。
 */
function isStrictShopOpeningSnapshot(value: unknown): value is {
    shop_name: string;
    owner_name: string;
    contact_email: string;
    representative_phone: string;
    notes?: string;
} {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const v = value as Record<string, unknown>;
    const keys = Object.keys(v);
    const allowed = ['shop_name', 'owner_name', 'contact_email', 'representative_phone', 'notes'];
    if (!keys.every((k) => allowed.includes(k))) {
        return false;
    }

    return (
        typeof v.shop_name === 'string' &&
        typeof v.owner_name === 'string' &&
        typeof v.contact_email === 'string' &&
        typeof v.representative_phone === 'string' &&
        (v.notes === undefined || typeof v.notes === 'string')
    );
}

/**
 * 管理画面メインコンポーネント
 */
export default function AdminPage() {
    /** 翻訳用フック (AdminPage namespace) */
    const t = useTranslations('AdminPage');
    /** エラー翻訳用フック */
    const { translateError } = useBackendError();
    /** 生成するQRコードの数 */
    const [count, setCount] = useState(10);
    /** 検索キーワード (現在はQRCodeListSectionが主に担当) */
    const [keyword, setKeyword] = useState("");
    /** 管理者による手動生成時の対象ショップID */
    const [shopId, setShopId] = useState("");
    /** 紐付ける商品ID(オプション) */
    const [productId, setProductId] = useState("");
    /** 紐付ける会員ID(オプション) */
    const [ownerUuid, setOwnerUuid] = useState("");
    /** 紐付ける贈り主ID(オプション) */
    const [senderId, setSenderId] = useState("");
    /** 有効期限設定 */
    const [expiryDate, setExpiryDate] = useState("");
    /** 生成時に即アクティベートするかどうかの設定 */
    const [activateNow, setActivateNow] = useState(false);
    /** メタデータ（ShopID等）を使用した詳細設定を使用するか */
    const [useMetadataOptions, setUseMetadataOptions] = useState(false);
    /** このセッション中に生成したバッチ */
    const [sessionBatches, setSessionBatches] = useState<any[]>([]);
    /** DBから取得したバッチ履歴（全件・検索用） */
    const [batchHistory, setBatchHistory] = useState<any[]>([]);
    /** バッチ履歴のページングカーソル */
    const [batchCursor, setBatchCursor] = useState<any>(null);
    /** バッチ履歴読み込み中フラグ */
    const [isBatchesLoading, setIsBatchesLoading] = useState(false);
    /** バッチ検索キーワード */
    const [batchSearchKeyword, setBatchSearchKeyword] = useState("");
    /** PDF生成時の用紙フォーマット（A4等） */
    const [paperFormat, setPaperFormat] = useState("51677E-1.036");
    /** カードのデザイン（システムのプリセットまたはDBカスタムデザイン） */
    const [cardFormat, setCardFormat] = useState("gakuchousenbeiv1");
    /** DBから取得したカスタムデザイン一覧 */
    const [dbCardDesigns, setDbCardDesigns] = useState<any[]>([]);
    /** デザイン情報の再取得が必要かどうかのフラグ */
    const [reloadDbCardDesigns, setReloadDbCardDesigns] = useState(true);
    /** 生成中フラグ */
    const [isGenerating, setIsGenerating] = useState(false);
    /** CSVエクスポート中フラグ (OrderIDを保持) */
    const [isExportingCsv, setIsExportingCsv] = useState<string | null>(null);
    /** アクティブなタブ (qrcodes / cardorders / designs / shops / tools) */
    const [activeTab, setActiveTab] = useState("qrcodes");
    /** カード注文一覧 */
    const [cardOrders, setCardOrders] = useState<any[]>([]);
    /** カード注文読み込み中フラグ */
    const [cardOrdersLoading, setCardOrdersLoading] = useState(false);
    /** カード注文のフィルターステータス (ORDERED / PRINTING / SHIPPED 等) */
    const [cardOrderFilterStatus, setCardOrderFilterStatus] = useState("ORDERED");
    /** カード注文のショップフィルター */
    const [cardOrderFilterShopId, setCardOrderFilterShopId] = useState("");
    /** ルーター */
    const router = useRouter();
    /** 直近でコピーしたID (UI通知用) */
    const [copiedId, setCopiedId] = useState<string | null>(null);
    /** 日本語フォントのキャッシュ */
    const [fontCache, setFontCache] = useState<{ [key: string]: string }>({});

    // ID Search states
    const [searchId, setSearchId] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [searchedOrder, setSearchedOrder] = useState<any>(null);

    /** 手動生成セクションの表示・非表示 */
    const [isManualGenerateOpen, setIsManualGenerateOpen] = useState(false);
    /** 直近の印刷履歴セクションの表示・非表示 */
    const [isBatchHistoryOpen, setIsBatchHistoryOpen] = useState(false);
    /** 発注済みで未対応のカード印刷の件数 */
    const [orderedCardOrdersCount, setOrderedCardOrdersCount] = useState(0);
    /** 未対応の問い合わせ件数 */
    const [activeInquiriesCount, setActiveInquiriesCount] = useState(0);


    /**
     * クリップボードにテキストをコピーします。
     */
    const handleCopy = (id: string) => {
        navigator.clipboard.writeText(id).then(() => {
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        });
    };

    /**
     * フォントを Base64 形式で取得し、キャッシュします。
     */
    const fetchFontAsBase64 = async (url: string): Promise<string | undefined> => {
        if (fontCache[url]) return fontCache[url];
        try {
            const resp = await fetch(url);
            if (!resp.ok) return undefined;
            const blob = await resp.blob();
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            if (base64) setFontCache(prev => ({ ...prev, [url]: base64 }));
            return base64;
        } catch (e) {
            console.error(`Font fetch failed: ${url}`, e);
            return undefined;
        }
    };

    /**
     * カスタムカードデザインの一覧をバックエンドから取得します。
     */
    const fetchDbCardDesigns = async () => {
        try {
            const data = await adminApi.admin_carddesigns_list({});
            setDbCardDesigns(data.items || []);
        } catch (e) {
            // console.error("Failed to fetch designs", e);
        }
    };

    /**
     * タブ切り替えや初期化時のデータ取得制御。
     */
    useEffect(() => {
        if (reloadDbCardDesigns && (activeTab === "qrcodes" || activeTab === "cardorders" || activeTab === "shops")) {
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

    /**
     * 直近の印刷履歴が有効な場合のみデータを取得
     */
    useEffect(() => {
        if (activeTab === "cardorders" && isBatchHistoryOpen) {
            fetchBatchHistory();
        }
    }, [activeTab, isBatchHistoryOpen]);

    /**
     * 発注済みで未対応(ステータスが 'ORDERED')のカード注文の総数を取得します。
     * バッジに表示するために使用します。
     */
    const fetchOrderedCardOrdersCount = async () => {
        try {
            // ステータス ORDERED の注文を最大100件取得して件数をカウントします。
            const data = await adminApi.admin_card_orders_list({
                status: 'ORDERED',
                limit: 100
            });
            setOrderedCardOrdersCount(data.items?.length || 0);
        } catch (e) {
            console.error("Failed to fetch ordered card orders count", e);
        }
    };

    /**
     * 未対応の問い合わせ（アクティブなチャット）の総数を取得します。
     * バッジに表示するために使用します。
     */
    const fetchActiveInquiriesCount = async () => {
        try {
            // 終了ステータスの定義
            const TERMINAL_STATUSES = new Set(['APPROVED', 'REJECTED', 'CANCELLED', 'RESOLVED', 'CLOSED', 'NOTIFICATION']);
            const normalizeStatus = (status?: string) => String(status || '').toUpperCase();
            const isTerminalStatus = (status?: string) => TERMINAL_STATUSES.has(normalizeStatus(status));
            
            let collectedCount = 0;
            let cursor: string | null = null;
            
            // 最大10回ループしてアクティブな件数を集計します（通常は数回で終了）
            for (let i = 0; i < 10; i++) {
                const response = await adminApi.fetch_post('/unified/chat/list', {
                    participant_id: 'ADMIN',
                    include_archived: false,
                    limit: 50,
                    ...(cursor ? { cursor } : {}),
                });
                
                const items: any[] = response.items || [];
                const activeItems = items.filter((chat) => !isTerminalStatus(chat?.status));
                
                collectedCount += activeItems.length;
                
                cursor = response.cursor ?? null;
                if (!cursor || items.length < 50) {
                    break;
                }
            }
            
            setActiveInquiriesCount(collectedCount);
        } catch (e) {
            console.error("Failed to fetch active inquiries count", e);
        }
    };

    /**
     * 初期表示時に未対応の件数を取得します。
     */
    useEffect(() => {
        fetchOrderedCardOrdersCount();
        fetchActiveInquiriesCount();
    }, []);

    /**
     * カード注文の一覧を取得します（フィルタ条件に従う）。
     */
    const fetchCardOrders = async () => {
        setCardOrdersLoading(true);
        try {
            const data = await adminApi.admin_card_orders_list({
                status: cardOrderFilterStatus,
                limit: 50
            });
            setCardOrders(data.items || []);
            // リスト更新時にバッジ件数も再取得します。
            fetchOrderedCardOrdersCount();
        } catch (e) {
            console.error("Failed to fetch card orders", e);
        } finally {
            setCardOrdersLoading(false);
        }
    };

    /**
     * 直近の QR バッチ履歴をデータベースから取得します。
     */
    const fetchBatchHistory = async (cursor?: any) => {
        setIsBatchesLoading(true);
        try {
            const data = await adminApi.admin_qr_batch_list({
                limit: 10,
                cursor: cursor,
                keyword: batchSearchKeyword.trim() || undefined
            });
            if (cursor) {
                setBatchHistory(prev => [...prev, ...(data.items || [])]);
            } else {
                setBatchHistory(data.items || []);
            }
            setBatchCursor(data.cursor);
        } catch (e) {
            console.error("Failed to fetch batches", e);
        } finally {
            setIsBatchesLoading(false);
        }
    };

    /**
     * バッチIDでバッチ履歴を検索します。
     */
    const handleSearchBatches = async () => {
        if (!batchSearchKeyword.trim()) {
            fetchBatchHistory();
            return;
        }
        setIsBatchesLoading(true);
        try {
            const data = await adminApi.admin_qr_batch_list({
                keyword: batchSearchKeyword.trim(),
                limit: 10
            });
            setBatchHistory(data.items || []);
            setBatchCursor(data.cursor); // 検索結果もページング可能にする
        } catch (e) {
            console.error("Failed to search batches", e);
        } finally {
            setIsBatchesLoading(false);
        }
    };

    /**
     * カード注文のステータスを更新します。
     * ワークフローの制御（未処理 -> 印刷中 -> 発送済み等）を行います。
     * @param shopId 対象ショップID
     * @param orderId 対象注文ID
     * @param status 新しいステータス
     * @param batchId 紐付けるQRバッチID (印刷工程開始時に自動設定されることが多い)
     */
    const handleUpdateCardOrderStatus = async (shopId: string, orderId: string, status: string, batchId?: string) => {
        try {
            // UIに即座に反映させるため楽観的更新を実施
            setCardOrders(prev => prev.map(o => o.order_id === orderId ? { ...o, status, batch_id: batchId || o.batch_id, ts_updated_at: new Date().toISOString() } : o));

            await adminApi.admin_card_orders_update({
                shop_id: shopId,
                order_id: orderId,
                status,
                batch_id: batchId
            });

            // GSI(Global Secondary Index)の反映遅延を考慮し、少々の待機後に一覧を再取得
            setTimeout(() => fetchCardOrders(), 1000);
        } catch (e) {
            console.error("Failed to update status:", e);
            alert(translateError('Internal Server Error'));
            // エラー時はDBの状態を正として再取得し直す
            fetchCardOrders();
        }
    };

    //Note: Authentication check is now handled by AdminLayout







    /**
     * 指定されたカード注文 (Card Order) に対して、PDFまたはCSVのエクスポートを実行します。
     * 必要に応じて、このタイミングで新規のQRコードを生成（バッチ作成）します。
     * 
     * フロー:
     * 1. 注文に紐づくバッチがあるか確認。
     * 2. あれば既存バッチの内容を取得。なければ新規生成 API を叩く。
     * 3. 印刷物生成用のデータをローカルバッチ履歴に追加。
     * 4. デザイン情報（システム定義 or カスタム定義）を解決。
     * 5. generatePDF / generateCSVExport を呼び出してブラウザからダウンロード。
     * 
     * @param order 注文データ
     * @param type エクスポート形式 ('pdf' | 'csv')
     */
    const handleExport = async (order: any, type: 'pdf' | 'csv') => {
        setIsExportingCsv(order.order_id); // UIの進捗表示に使用
        try {
            let codes: any[] = [];
            let batchId = order.batch_id;

            if (batchId) {
                // 【ケースA】既にバッチIDが注文に紐付いている場合 -> 既存データを取得
                const data = await adminApi.admin_qr_batch_get({ batch_id: batchId });
                codes = data.data;

                // もしステータスが ORDERED のままなら、印刷開始(PRINTING)に更新
                if (order.status === 'ORDERED') {
                    await handleUpdateCardOrderStatus(order.shop_id, order.order_id, 'PRINTING', batchId);
                }
            } else if (order.status === 'ORDERED') {
                // 【ケースB】まだQRコードが未生成の場合 -> 新規一括生成を実行
                const data = await adminApi.admin_qr_generate({
                    order_id: order.order_id
                });
                codes = data.data;
                batchId = data.batch_id;

                // Lambda側で注文データの更新も行われるが、念のためUIを同期
                setTimeout(() => fetchCardOrders(), 1000);
            } else {
                // 特殊ケース：バッチ情報なしに発送等へ移行している場合
                alert(t('cardOrders.details.noBatchIdFound'));
                return;
            }

            // ダウンロードトリガー用のバッチオブジェクト作成
            const batch = {
                id: batchId,
                count: codes.length,
                codes: codes,
                date: new Date(order.ts_created_at || new Date()).toLocaleString(),
                status: 'ready',
                design_id: order.design_id
            };

            // ローカルの生成履歴に追加（セッション中のみ保持）
            setSessionBatches(prev => {
                const exists = prev.find(b => b.id === batchId);
                if (exists) return prev;
                return [batch, ...prev];
            });

            // デザインIDの解決（カスタム design_id または システムプリセット）
            const resolveDesign = (designId?: string) => {
                const targetId = designId || cardFormat;
                const dbDesign = dbCardDesigns.find(d => d.design_id === targetId);
                if (dbDesign) return dbDesign;
                if (cardformats[targetId]) return targetId;
                const globalDesign = dbCardDesigns.find(d => d.design_id === cardFormat);
                return globalDesign || cardFormat;
            };
            const design = resolveDesign(order.design_id);

            // PDF/CSVのダウンロード実行
            if (type === 'pdf') {
                await generatePDF(batch, paperFormat, design, false);
            } else {
                await generateCSVExport(batch, design);
            }
        } catch (e) {
            console.error("Export failed", e);
            alert(t('cardOrders.details.exportFailed'));
        } finally {
            setIsExportingCsv(null);
        }
    };

    const handleGeneratePDF = async (batch: any, paperformat: string, cardformat: string | any, fillall: boolean = false) => {
        return generatePDF(batch, paperformat, cardformat, fillall);
    };

    /**
     * フォーム入力内容から新規の「カード注文 (Card Order)」を作成し、
     * 即座にQRコード生成とPDFダウンロード（初期配布用）までを一括して実行します。
     * 
     * 本システムでは、QRコードのみの生成は行わず、必ず「注文」に紐付けることで
     * 発送フローやデザイン履歴、メタ情報の整合性を担保しています。
     */
    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            // 1. CARD_ORDER エンティティを作成 (DBに永続化)
            const orderRes = await adminApi.admin_card_orders_create({
                shop_id: shopId,
                quantity: count,
                design_id: cardFormat,
                product_id: productId || undefined,
                shop_user_id: ownerUuid || undefined,
                sender_user_id: senderId || undefined,
                expiration_date: expiryDate ? new Date(expiryDate).toISOString() : undefined,
                activate_now: activateNow
            });

            // 2. 注文履歴を再読込
            await fetchCardOrders();

            // 3. 作成された注文を元に、生成・ダウンロード処理を開始 (handleExportを共有)
            const newOrder = {
                order_id: orderRes.order_id,
                shop_id: shopId,
                quantity: count,
                status: 'ORDERED',
                design_id: cardFormat,
                product_id: productId,
                ts_created_at: new Date().toISOString()
            };

            await handleExport(newOrder, 'pdf');

        } catch (e: any) {
            const errData = e;
            alert((translateError(errData?.message, errData?.detail) || errData?.message) || t('batches.alerts.failed') + (errData?.detail?.toString() || ''));
        } finally {
            setIsGenerating(false);
        }
    };

    /**
     * ID（注文ID、バッチID、QRコードID）による各リソースの検索を実行します。
     * プレフィックス(QR#, ORDER#等)の正規化を行い、適切なAPIエンドポイントへ振り分けます。
     */
    const handleIdSearch = async () => {
        if (!searchId.trim()) return;
        setIsSearching(true);
        try {
            // 入力の正規化: 先頭のプレフィックスを除去して純粋なUUID/IDを取り出す
            let orderId = searchId.trim().replace(/^(ORDER#|QR_BATCH#|QR#)/, '');

            console.log(`[AdminSearch] Starting search workflow for normalized ID: ${orderId}`);

            // 1. バッチID（QRコードの束）としての検索を優先試行
            try {
                const batchRes = await adminApi.admin_qr_batch_get({ batch_id: orderId });
                if (batchRes && batchRes.order_id) {
                    // バッチに紐づく注文IDを発見した場合は、注文情報の取得へ移行
                    console.log(`[AdminSearch] Found matching Batch. Resolving to OrderID: ${batchRes.order_id}`);
                    orderId = batchRes.order_id;
                }
            } catch (e) {
                // バッチIDでない場合はそのまま注文IDとして扱う
            }

            // 2. 確定した注文IDを用いて、詳細情報を取得
            const orderRes = await adminApi.admin_card_orders_get({ order_id: orderId });
            setSearchedOrder(orderRes);
        } catch (e: any) {
            console.error('[AdminSearch] Search failed:', e);
            if (e.status === 404) {
                alert(t('cardOrders.search.notFound'));
            } else {
                alert(t('cardOrders.search.error'));
            }
        } finally {
            setIsSearching(false);
        }
    };


    const currentSelectedDesign = dbCardDesigns.find(d => d.design_id === cardFormat) || cardformats[cardFormat] || cardformats['gakuchousenbeiv1'];
    const previewAspectRatio = `${currentSelectedDesign.width || 84} / ${currentSelectedDesign.height || 52}`;



    return (
        <div className="min-h-screen bg-mist-900 p-3 sm:p-8 text-white overflow-x-hidden"> {/* bg-[#383838] */}
            <div className="w-full max-w-[1600px] mx-auto space-y-6 overflow-x-hidden">
                <div className="flex justify-between items-center flex-wrap gap-4">
                    <h1 className="text-2xl font-bold text-white w-full sm:w-auto text-center sm:text-left">{t('title')}</h1>
                    <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-end w-full sm:w-auto">
                        <Link href="/admin/help" target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" className="bg-mist-800 border-mist-700 text-mist-300 hover:bg-mist-700 hover:text-white transition-all duration-300 rounded-full">
                                <HelpCircle className="w-4 h-4 mr-2" />
                                {t('helpButton') || "Help"}
                            </Button>
                        </Link>
                        
                        <AdminSettingsSection />
                        {/* <Link href="/login" className="w-full sm:w-auto">
                            <Button variant="destructive" className="shadow-md cursor-pointer border border-red-900 w-full sm:w-auto">
                                {t('qrAdminLoginPage')}
                            </Button>
                        </Link> */}

                        <Button variant="outline" className="bg-mist-800 border-mist-700 text-mist-300 hover:bg-mist-700 hover:text-white transition-all duration-300 rounded-full" onClick={() => router.push('/login')}>
                            {t('back')} <ChevronDown className="h-4 w-4 mr-1 rotate-270" />
                        </Button>

                        <Button
                            variant="ghost"
                            className={cn(
                                "cursor-pointer w-full sm:w-40 justify-center h-10 text-white hover:bg-mist-700 hover:text-white")}
                            onClick={async () => {
                                await signOut();
                                router.push(`/`);
                            }}
                        >
                            <LogOut className="w-5 h-5 mr-2" />
                            {t('logout')}
                        </Button>
                    </div>
                </div>


                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
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
                            "relative flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md",
                            activeTab === "cardorders"
                                ? "bg-white border-white text-mist-900 ring-2 ring-mist-700 ring-offset-2 ring-offset-mist-900"
                                : "bg-mist-800 border-mist-700 text-mist-300 hover:border-mist-600 hover:bg-mist-700/50"
                        )}
                    >
                        {orderedCardOrdersCount > 0 && (
                            <Badge
                                variant="destructive"
                                className="absolute top-3 right-3 px-2 py-0.5 text-xs font-bold rounded-full bg-red-500 text-white animate-pulse"
                            >
                                {orderedCardOrdersCount}
                            </Badge>
                        )}
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
                        onClick={() => setActiveTab("inquiries")}
                        className={cn(
                            "relative flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md",
                            activeTab === "inquiries"
                                ? "bg-white border-white text-mist-900 ring-2 ring-mist-700 ring-offset-2 ring-offset-mist-900"
                                : "bg-mist-800 border-mist-700 text-mist-300 hover:border-mist-600 hover:bg-mist-700/50"
                        )}
                    >
                        {activeInquiriesCount > 0 && (
                            <Badge
                                variant="destructive"
                                className="absolute top-3 right-3 px-2 py-0.5 text-xs font-bold rounded-full bg-red-500 text-white animate-pulse"
                            >
                                {activeInquiriesCount}
                            </Badge>
                        )}
                        <HelpCircle className={cn("w-12 h-12 mb-3", activeTab === "inquiries" ? "text-mist-900" : "text-mist-400")} />
                        <span className="text-lg font-bold">{t('tabs.inquiries')}</span>
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





                {/* 
                 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                 * ─── QRコード管理タブ (QR Codes) ──────────────────────────────────────
                 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                 */}
                {activeTab === "qrcodes" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">


                        {/* すべてのQRコード一覧 */}
                        <QRCodeListSection
                            apiUrl={NEXT_PUBLIC_API_URL}
                            onGeneratePDF={handleGeneratePDF}
                            paperFormat={paperFormat}
                            cardFormat={cardFormat}
                            dbCardDesigns={dbCardDesigns}
                        />
                    </div>
                )}





                {/* 
                 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                 * ─── カード注文管理タブ (Card Orders) ──────────────────────────────────
                 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                 */}
                {activeTab === "cardorders" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">

                        <Card>
                            <CardHeader className="flex flex-row items-center gap-2">
                                <Settings />
                                <CardTitle>{t('cardOrders.config')}</CardTitle>
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
                            onExport={handleExport}
                            isExporting={isExportingCsv}
                            dbCardDesigns={dbCardDesigns}
                            paperFormat={paperFormat}
                            cardFormat={cardFormat}
                        />

                        {/* ID Search Section (Standalone) */}
                        {/* <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Search className="w-5 h-5" />
                                    {t('cardOrders.search.title')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <Input
                                            placeholder={t('cardOrders.search.placeholder')}
                                            value={searchId}
                                            onChange={(e) => setSearchId(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleIdSearch()}
                                            className="pl-10 h-11 text-black bg-white border-gray-200"
                                        />
                                    </div>
                                    <Button
                                        onClick={handleIdSearch}
                                        disabled={isSearching || !searchId.trim()}
                                        className="h-11 px-6 bg-mist-800 hover:bg-mist-700 text-white font-bold transition-all"
                                    >
                                        {isSearching ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                                {t('cardOrders.search.searching')}
                                            </>
                                        ) : (
                                            <>
                                                <Search className="w-4 h-4 mr-2" />
                                                {t('cardOrders.search.button')}
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card> */}



                        {/* 印刷履歴セクションを表示/非表示 (Toggle Button) */}
                        <div className="flex justify-end mb-2">
                            <Button
                                variant="outline"
                                className="bg-mist-800 border-mist-700 text-mist-300 hover:bg-mist-700 hover:text-white transition-all duration-300 rounded-full"
                                onClick={() => setIsBatchHistoryOpen(!isBatchHistoryOpen)}
                            >
                                <Plus className={cn("w-4 h-4 mr-2 transition-transform duration-300", isBatchHistoryOpen && "rotate-45")} />
                                {isBatchHistoryOpen ? t('batches.hideBatchHistory') || "印刷履歴を隠す" : t('batches.showBatchHistory') || "印刷履歴を表示"}
                            </Button>
                        </div>

                        {/* 印刷履歴セクション（データベースから直近10件を取得） */}
                        {isBatchHistoryOpen && (
                            <Card className="border-mist-200 overflow-hidden shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
                                <CardHeader className="bg-mist-50/50 border-b">
                                    <div className="flex justify-between items-center flex-wrap gap-4">
                                        <div>
                                            <CardTitle className="text-mist-900 flex items-center gap-2">
                                                <Printer className="w-5 h-5" />
                                                {t('batches.recentTitle') || "直近の印刷履歴"}
                                            </CardTitle>
                                            <CardDescription>
                                                データベースから取得した最近の印刷バッチ（最新10件）
                                            </CardDescription>
                                        </div>
                                        <div className="flex items-center gap-2 w-full sm:w-auto">
                                            <div className="relative flex-1 sm:w-64">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                                <Input
                                                    placeholder={t('batches.searchPlaceholder') || "バッチID / 注文ID / キーワード"}
                                                    value={batchSearchKeyword}
                                                    onChange={(e) => setBatchSearchKeyword(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleSearchBatches()}
                                                    className="pl-10 h-10 text-black bg-white border-gray-200 focus:ring-mist-500"
                                                />
                                            </div>
                                            <Button
                                                onClick={handleSearchBatches}
                                                disabled={isBatchesLoading}
                                                className="bg-mist-800 hover:bg-mist-700 text-white"
                                            >
                                                {isBatchesLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="divide-y divide-gray-100">
                                        {isBatchesLoading && batchHistory.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center p-12 text-mist-500">
                                                <Loader2 className="w-8 h-8 animate-spin mb-4" />
                                                <p>{t('batches.loading')}</p>
                                            </div>
                                        ) : batchHistory.length === 0 ? (
                                            <div className="p-12 text-center text-gray-500">
                                                <p>{t('batches.noBatches')}</p>
                                            </div>
                                        ) : (
                                            <div className="p-4 space-y-4">
                                                {batchHistory.map(batch => (
                                                    <BatchItem
                                                        key={batch.id}
                                                        batch={batch}
                                                        t={t}
                                                        handleCopy={handleCopy}
                                                        copiedId={copiedId}
                                                        setIsExportingCsv={setIsExportingCsv}
                                                        isExportingCsv={isExportingCsv}
                                                        cardFormat={cardFormat}
                                                        dbCardDesigns={dbCardDesigns}
                                                        handleGeneratePDF={handleGeneratePDF}
                                                        paperFormat={paperFormat}
                                                    />
                                                ))}

                                                {batchCursor && (
                                                    <div className="flex justify-center pt-4">
                                                        <Button
                                                            variant="outline"
                                                            onClick={() => fetchBatchHistory(batchCursor)}
                                                            disabled={isBatchesLoading}
                                                            className="w-full sm:w-auto text-mist-900 border-mist-200 hover:bg-mist-50"
                                                        >
                                                            {isBatchesLoading ? (
                                                                <>
                                                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                                                    {t('batches.loading')}
                                                                </>
                                                            ) : (
                                                                t('batches.loadMore') || "さらに読み込む"
                                                            )}
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        )}


                        {/* QRコード手動生成 (Toggle Button) */}
                        <div className="flex justify-end mb-2">
                            <Button
                                variant="outline"
                                className="bg-mist-800 border-mist-700 text-mist-300 hover:bg-mist-700 hover:text-white transition-all duration-300 rounded-full"
                                onClick={() => setIsManualGenerateOpen(!isManualGenerateOpen)}
                            >
                                <Plus className={cn("w-4 h-4 mr-2 transition-transform duration-300", isManualGenerateOpen && "rotate-45")} />
                                {isManualGenerateOpen ? t('generate.hideManualGenerate') : t('generate.showManualGenerate')}
                            </Button>
                        </div>

                        {/* QRコード生成 */}
                        {isManualGenerateOpen && (
                            <Card className="animate-in fade-in slide-in-from-top-2 duration-300">

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
                                                        <div
                                                            className="w-full relative rounded shadow-lg overflow-hidden border border-gray-700 bg-white"
                                                            style={{ aspectRatio: previewAspectRatio }}
                                                        >
                                                            <img
                                                                src={(dbCardDesigns.find(d => d.design_id === cardFormat)?.thumbf || dbCardDesigns.find(d => d.design_id === cardFormat)?.bgimgf) || cardformats[cardFormat]?.bgimgf}
                                                                alt={t('generate.frontPreview')}
                                                                className="absolute inset-0 w-full h-full object-fill"
                                                                crossOrigin="anonymous"
                                                            />
                                                        </div>
                                                        <p className="text-[10px] text-gray-500 text-center uppercase tracking-wider">{t('generate.front')}</p>
                                                    </div>
                                                    <div className="space-y-1 w-full">
                                                        <div
                                                            className="w-full relative rounded shadow-lg overflow-hidden border border-gray-700 bg-white"
                                                            style={{ aspectRatio: previewAspectRatio }}
                                                        >
                                                            <img
                                                                src={(dbCardDesigns.find(d => d.design_id === cardFormat)?.thumbb || dbCardDesigns.find(d => d.design_id === cardFormat)?.bgimgb) || cardformats[cardFormat]?.bgimgb}
                                                                alt={t('generate.backPreview')}
                                                                className="absolute inset-0 w-full h-full object-fill"
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
                                {/* このページを開いてから生成したQRコードのバッチ一覧
                                {sessionBatches.length > 0 && (
                                    <CardFooter className="border-t">
                                        <div className="space-y-4 w-full">
                                            <CardTitle className="text-sm font-semibold">{t('batches.title')}</CardTitle>
                                            <div className="grid grid-cols-1 gap-4">
                                                {sessionBatches.map(batch => (
                                                    <BatchItem
                                                        key={batch.id}
                                                        batch={batch}
                                                        t={t}
                                                        handleCopy={handleCopy}
                                                        copiedId={copiedId}
                                                        setIsExportingCsv={setIsExportingCsv}
                                                        isExportingCsv={isExportingCsv}
                                                        cardFormat={cardFormat}
                                                        dbCardDesigns={dbCardDesigns}
                                                        handleGeneratePDF={handleGeneratePDF}
                                                        paperFormat={paperFormat}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    </CardFooter>
                                )} */}
                            </Card>
                        )}



                        {searchedOrder && (
                            <OrderDetailsDialog
                                order={searchedOrder}
                                isOpen={!!searchedOrder}
                                onClose={() => setSearchedOrder(null)}
                                onUpdateStatus={handleUpdateCardOrderStatus}
                                onExport={handleExport}
                                isExporting={isExportingCsv}
                                dbCardDesigns={dbCardDesigns}
                                paperFormat={paperFormat}
                            />
                        )}


                    </div>
                )}





                {/* 
                 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                 * ─── ショップ管理タブ (Shops) ─────────────────────────────────────────
                 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                 */}
                {activeTab === "shops" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                            {/* ショップのメタデータ管理 (NEW) */}
                            <AdminShopCardDesignLinkSection apiUrl={NEXT_PUBLIC_API_URL} dbCardDesigns={dbCardDesigns} />

                            {/* ショップの新規作成 (NEW) */}
                            <AdminShopCreationSection apiUrl={NEXT_PUBLIC_API_URL} />

                            {/* ショップオーナーの変更 (NEW) */}
                            <ShopOwnerChangeSection apiUrl={NEXT_PUBLIC_API_URL} />

                            {/* ショップ管理者の紐づけ (NEW) */}
                            <ManagerLinkingSection apiUrl={NEXT_PUBLIC_API_URL} />
                        </div>
                    </div>
                )}




                {/* 
                 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                 * ─── 問い合わせ (Inquiries) ─────────────────────────────────────────
                 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                 */}
                {activeTab === "inquiries" && (
                    <div className="grid grid-cols-1 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300 items-start">
                        <AdminInquiryChatSection dbCardDesigns={dbCardDesigns} onRefreshInquiriesCount={fetchActiveInquiriesCount} />
                    </div>
                )}





                {/* 
                 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                 * ─── システムツールタブ (Tools) ────────────────────────────────────────
                 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                 */}
                {activeTab === "tools" && (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300 items-start">
                        {/* データダンプ */}
                        <DataDumpSection apiUrl={NEXT_PUBLIC_API_URL} />
                    </div>
                )}





                {/* 
                 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                 * ─── デザイン管理タブ (Designs) ───────────────────────────────────────
                 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                 */}
                {activeTab === "designs" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <CardDesignEditor apiUrl={NEXT_PUBLIC_API_URL} />
                    </div>
                )}





            </div>
        </div>
    );
}

/**
 * 管理者向けの問い合わせチャット画面。
 * 一覧と詳細を同一画面で表示し、ADMIN 参加者としてメッセージの閲覧・返信を行います。
 */
function AdminInquiryChatSection({ dbCardDesigns, onRefreshInquiriesCount }: { dbCardDesigns: any[], onRefreshInquiriesCount?: () => void }) {
    const t = useTranslations('AdminPage');
    const [confirmTerminalAction, setConfirmTerminalAction] = useState<'RESOLVED' | 'APPROVED' | 'REJECTED' | null>(null);
    const [notificationLoading, setNotificationLoading] = useState(false);
    const [statusUpdating, setStatusUpdating] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [chats, setChats] = useState<any[]>([]);
    const [pastChats, setPastChats] = useState<any[]>([]);
    const [pastCarry, setPastCarry] = useState<any[]>([]);
    const [pastLoading, setPastLoading] = useState(false);
    const [pastCursor, setPastCursor] = useState<string | null>(null);
    const [pastHasNext, setPastHasNext] = useState(false);
    const [showPastChats, setShowPastChats] = useState(false);
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [selectedChat, setSelectedChat] = useState<any | null>(null);
    const [selectedMessages, setSelectedMessages] = useState<any[]>([]);
    const [inputMessage, setInputMessage] = useState('');
    const [sendingMessage, setSendingMessage] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [chatPageSize, setChatPageSize] = useState<number>(10);
    const [chatPageCursors, setChatPageCursors] = useState<(string | null)[]>([null]);
    const [chatPageIdx, setChatPageIdx] = useState<number>(0);
    const [chatHasNext, setChatHasNext] = useState(false);
    const [shopOpenDialogOpen, setShopOpenDialogOpen] = useState(false);
    const [approveDesignId, setApproveDesignId] = useState('');
    const [rejectReason, setRejectReason] = useState('');
    const [adminMemo, setAdminMemo] = useState('');
    const [shopOpenActionLoading, setShopOpenActionLoading] = useState(false);
    const TERMINAL_STATUSES = useMemo(() => new Set(['APPROVED', 'REJECTED', 'CANCELLED', 'RESOLVED', 'CLOSED', 'NOTIFICATION']), []);

    const getChatTypeLabel = (chatType?: string): string => {
        if (!chatType) return '-';
        const labels: Record<string, string> = {
            SHOP_OPENING: t('inquiryChat.chatTypes.shopOpening'),
            USER_SUPPORT: t('inquiryChat.chatTypes.userSupport'),
            SHOP_SUPPORT: t('inquiryChat.chatTypes.shopSupport'),
            SHOP_DESIGN: t('inquiryChat.chatTypes.shopDesign'),
            CARD_DESIGN: t('inquiryChat.chatTypes.cardDesign'),
            GIFT_RECEIVER_SUPPORT: t('inquiryChat.chatTypes.giftReceiverSupport'),
            MISC: t('inquiryChat.chatTypes.misc'),
        };
        return labels[chatType] || chatType;
    };

    const getStatusLabel = (status?: string): string => {
        if (!status) return '-';
        const labels: Record<string, string> = {
            OPEN: t('inquiryChat.statuses.open'),
            RESOLVED: t('inquiryChat.statuses.resolved'),
            CLOSED: t('inquiryChat.statuses.closed'),
            DRAFT: t('inquiryChat.statuses.draft'),
            SUBMITTED: t('inquiryChat.statuses.submitted'),
            IN_REVIEW: t('inquiryChat.statuses.inReview'),
            IN_DESIGN: t('inquiryChat.statuses.inDesign'),
            COMPLETED: t('inquiryChat.statuses.completed'),
            APPROVED: t('inquiryChat.statuses.approved'),
            REJECTED: t('inquiryChat.statuses.rejected'),
            CANCELLED: t('inquiryChat.statuses.cancelled'),
            PENDING: t('inquiryChat.statuses.pending'),
            VERIFIED: t('inquiryChat.statuses.verified'),
            EXPIRED: t('inquiryChat.statuses.expired'),
            FAILED: t('inquiryChat.statuses.failed'),
            NOTIFICATION: t('inquiryChat.statuses.notification'),
        };
        return labels[status] || status;
    };

    const selectedParticipantIds = useMemo(() => {
        return Array.isArray(selectedChat?.participants) ? selectedChat.participants : [];
    }, [selectedChat]);

    const getSenderDisplayName = (message: any): string => {
        const senderId = message?.sender_id || '';
        if (senderId === 'ADMIN' || senderId.startsWith('ADMIN#')) {
            return t('inquiryChat.adminLabel');
        }
        return toDisplayParticipantId(senderId);
    };

    const normalizeStatus = (status?: string) => String(status || '').toUpperCase();

    const renderTextWithLinks = (value?: string): React.ReactNode => {
        const text = String(value || '').trim();
        if (!text) {
            return '-';
        }

        const parts = text.split(/(https?:\/\/[^\s]+)/g);
        return (
            <span className="whitespace-pre-wrap break-all">
                {parts.map((part, index) => {
                    if (/^https?:\/\/[^\s]+$/i.test(part)) {
                        return (
                            <a
                                key={`${part}-${index}`}
                                href={part}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-700 underline hover:text-blue-900"
                            >
                                {part}
                            </a>
                        );
                    }
                    return <React.Fragment key={`text-${index}`}>{part}</React.Fragment>;
                })}
            </span>
        );
    };

    const isTerminalStatus = (status?: string) => TERMINAL_STATUSES.has(normalizeStatus(status));

    const isSupportChatType = (chatType?: string) => {
        return ['USER_SUPPORT', 'SHOP_SUPPORT', 'SHOP_DESIGN', 'CARD_DESIGN', 'GIFT_RECEIVER_SUPPORT', 'MISC'].includes(String(chatType || '').toUpperCase());
    };

    const getAvailableTransitions = (chat: any): string[] => {
        const status = normalizeStatus(chat?.status);
        const chatType = String(chat?.chat_type || '').toUpperCase();

        // 一般チャット系（USER_SUPPORT, SHOP_SUPPORT, SHOP_DESIGN, CARD_DESIGN, MISC）
        // ステート遷移:
        //   OPEN → RESOLVED
        if (isSupportChatType(chatType)) {
            if (status === 'OPEN') return ['RESOLVED'];
            return [];
        }

        // SHOP_OPENING は承認/却下専用ダイアログで処理します。
        if (chatType === 'SHOP_OPENING') {
            return [];
        }

        return [];
    };

    const getTransitionLabel = (status: string) => {
        const labels: Record<string, string> = {
            RESOLVED: t('inquiryChat.actions.complete'),
        };
        return labels[status] || status;
    };

    const fetchFilteredChunk = async (
        mode: 'active' | 'past',
        startCursor: string | null,
        takeCount: number,
    ) => {
        const collected: any[] = [];
        let cursor = startCursor;
        let hasNext = false;

        for (let i = 0; i < 20; i += 1) {
            const response = await adminApi.fetch_post('/unified/chat/list', {
                participant_id: 'ADMIN',
                include_archived: false,
                limit: takeCount,
                ...(cursor ? { cursor } : {}),
            });

            const items: any[] = response.items || [];
            const filtered = items.filter((chat) => {
                const terminal = isTerminalStatus(chat?.status);
                return mode === 'active' ? !terminal : terminal;
            });

            if (filtered.length > 0) {
                collected.push(...filtered);
            }

            cursor = response.cursor ?? null;
            hasNext = !!cursor;
            if (!hasNext || collected.length >= takeCount) {
                break;
            }
        }

        return {
            items: collected.slice(0, takeCount),
            nextCursor: cursor,
            hasNext,
        };
    };

    const fetchPage = async (idx: number, cursors: (string | null)[] = chatPageCursors) => {
        setNotificationLoading(true);
        try {
            const cursor = cursors[idx] ?? null;

            const response = await fetchFilteredChunk('active', cursor, chatPageSize);
            setChats(response.items);
            setChatPageIdx(idx);
            setChatPageCursors((prev) => {
                const updated = [...prev];
                updated[idx] = cursor;
                if (response.nextCursor) updated[idx + 1] = response.nextCursor;
                else updated.splice(idx + 1);
                return updated;
            });
            setChatHasNext(!!response.nextCursor && response.hasNext);
        } catch (e) {
            console.error('Failed to fetch admin inquiry chats', e);
        } finally {
            setNotificationLoading(false);
        }
    };

    const fetchNotifications = () => {
        const fresh: (string | null)[] = [null];
        setChatPageCursors(fresh);
        setChatPageIdx(0);
        setChatHasNext(false);
        setShowPastChats(false);
        setPastChats([]);
        setPastCarry([]);
        setPastCursor(null);
        setPastHasNext(false);
        setSelectedChatId(null);
        setSelectedChat(null);
        setSelectedMessages([]);
        fetchPage(0, fresh);
        // 親コンポーネントのバッジ件数を更新します。
        onRefreshInquiriesCount?.();
    };

    const handleFetchPastChats = async () => {
        setPastLoading(true);
        try {
            const targetCount = chatPageSize;
            const collected: any[] = [];
            const carry = [...pastCarry];

            while (carry.length > 0 && collected.length < targetCount) {
                const item = carry.shift();
                if (item) collected.push(item);
            }

            let cursor = showPastChats ? pastCursor : null;
            let hasNext = !!cursor;
            const apiLimit = Math.max(50, targetCount * 5);

            for (let i = 0; i < 100 && collected.length < targetCount; i += 1) {
                const response = await adminApi.fetch_post('/unified/chat/list', {
                    participant_id: 'ADMIN',
                    include_archived: false,
                    limit: apiLimit,
                    ...(cursor ? { cursor } : {}),
                });

                const items: any[] = response.items || [];
                const filtered = items.filter((chat) => isTerminalStatus(chat?.status));

                for (const chat of filtered) {
                    if (collected.length < targetCount) {
                        collected.push(chat);
                    } else {
                        carry.push(chat);
                    }
                }

                cursor = response.cursor ?? null;
                hasNext = !!cursor;
                if (!hasNext) {
                    break;
                }
            }

            setShowPastChats(true);
            setPastChats((prev) => {
                const base = showPastChats ? prev : [];
                const seen = new Set(base.map((chat) => String(chat?.chat_id || '')));
                const merged = [...base];
                for (const chat of collected) {
                    const chatId = String(chat?.chat_id || '');
                    if (!chatId || seen.has(chatId)) {
                        continue;
                    }
                    seen.add(chatId);
                    merged.push(chat);
                }
                return merged;
            });
            setPastCarry(carry);
            setPastCursor(cursor);
            setPastHasNext(carry.length > 0 || hasNext);
        } catch (e) {
            console.error('Failed to fetch past chats', e);
        } finally {
            setPastLoading(false);
        }
    };

    const fetchAllMessages = async (chatId: string): Promise<any[]> => {
        const pageLimit = 100;
        let beforeSeq: number | undefined = undefined;
        const allDesc: any[] = [];

        for (let i = 0; i < 200; i += 1) {
            const res = await adminApi.fetch_post('/unified/chat/messages/get', {
                chat_id: chatId,
                limit: pageLimit,
                ...(typeof beforeSeq === 'number' ? { before_seq: beforeSeq } : {}),
            });

            const batch: any[] = Array.isArray(res?.messages) ? res.messages : [];
            if (batch.length === 0) break;
            allDesc.push(...batch);

            const seqs = batch.map((m) => m.seq).filter((v): v is number => typeof v === 'number');
            if (seqs.length === 0) break;
            const oldestSeq = Math.min(...seqs);
            if (oldestSeq <= 1 || batch.length < pageLimit) break;
            beforeSeq = oldestSeq;
        }

        const seen = new Set<string>();
        const dedupedDesc = allDesc.filter((m) => {
            const key = `${m.seq ?? ''}:${m.message_id ?? ''}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        return dedupedDesc.slice().reverse();
    };

    const openChatDetail = async (chatId: string) => {
        setInputMessage('');
        setSelectedChatId(chatId);
        setDetailLoading(true);
        try {
            const [chatRes, messagesRes] = await Promise.all([
                adminApi.fetch_post('/unified/chat/get', { chat_id: chatId }),
                fetchAllMessages(chatId),
            ]);

            setSelectedChat(chatRes.chat || null);
            setSelectedMessages(messagesRes);

            const unreadBefore = chats.find((chat) => chat.chat_id === chatId)?.unread_count_cache ?? 0;
            const lastMessageSeq = chatRes?.chat?.last_message_seq;
            if (unreadBefore > 0 && typeof lastMessageSeq === 'number') {
                await adminApi.fetch_post('/unified/chat/read/mark', {
                    chat_id: chatId,
                    participant_id: 'ADMIN',
                    last_read_seq: lastMessageSeq,
                });
                setChats((prev) => prev.map((chat) => (
                    chat.chat_id === chatId ? { ...chat, unread_count_cache: 0 } : chat
                )));
            }
        } catch (e) {
            console.error('Failed to fetch chat detail', e);
        } finally {
            setDetailLoading(false);
        }
    };

    const sendFreeText = async () => {
        const text = inputMessage.trim();
        const hasFile = !!selectedFile;
        if ((!text && !hasFile) || !selectedChatId || sendingMessage || uploading) return;
        setSendingMessage(true);
        try {
            let fileData: ChatFileData | null = null;

            if (selectedFile) {
                setUploading(true);
                try {
                    fileData = await uploadChatFile(adminApi.fetch_post.bind(adminApi), selectedChatId, selectedFile);
                } finally {
                    setUploading(false);
                }
            }

            await adminApi.fetch_post('/unified/chat/messages/send', {
                chat_id: selectedChatId,
                sender_id: 'ADMIN',
                type: fileData ? 'FILE' : 'TEXT',
                message: text || '',
                ...fileData,
            });

            setInputMessage('');
            setSelectedFile(null);
            const allMessages = await fetchAllMessages(selectedChatId);
            setSelectedMessages(allMessages);
            setChats((prev) =>
                prev.map((c) =>
                    c.chat_id === selectedChatId
                        ? { ...c, ts_last_message_at: new Date().toISOString() }
                        : c,
                ),
            );
        } catch (e) {
            console.error('Failed to send message', e);
            alert(t('inquiryChat.sendFailed'));
        } finally {
            setSendingMessage(false);
        }
    };

    const handleUpdateChatStatus = async (nextStatus: string) => {
        if (!selectedChat?.chat_id || typeof selectedChat?.version !== 'number' || statusUpdating) {
            return;
        }

        setStatusUpdating(true);
        try {
            await adminApi.fetch_post('/unified/chat/status/update', {
                chat_id: selectedChat.chat_id,
                next_status: nextStatus,
                expected_version: selectedChat.version,
            });

            const [chatRes, activeRes] = await Promise.all([
                adminApi.fetch_post('/unified/chat/get', { chat_id: selectedChat.chat_id }),
                fetchFilteredChunk('active', chatPageCursors[chatPageIdx] ?? null, chatPageSize),
            ]);

            setSelectedChat(chatRes.chat || null);
            setChats(activeRes.items);
            setChatHasNext(!!activeRes.nextCursor && activeRes.hasNext);

            if (isTerminalStatus(chatRes?.chat?.status)) {
                setSelectedChatId(null);
                setSelectedChat(null);
                setSelectedMessages([]);
                setInputMessage('');
            }
        } catch (e) {
            console.error('Failed to update chat status', e);
            alert(t('inquiryChat.updateFailed'));
        } finally {
            setStatusUpdating(false);
        }
    };

    const isChatClosed = isTerminalStatus(selectedChat?.status);
    const availableTransitions = useMemo(() => getAvailableTransitions(selectedChat), [selectedChat]);
    const isShopOpeningSelected = String(selectedChat?.chat_type || '').toUpperCase() === 'SHOP_OPENING';
    const isCardDesignSelected = String(selectedChat?.chat_type || '').toUpperCase() === 'CARD_DESIGN';
    const visibleTransitions = useMemo(() => {
        if (isCardDesignSelected) {
            return [];
        }
        return availableTransitions;
    }, [availableTransitions, isCardDesignSelected]);

    const editableStatuses = useMemo(() => new Set(['OPEN']), []);
    const isShopOpeningDecisionLocked = useMemo(() => {
        if (!isShopOpeningSelected) return true;
        return !editableStatuses.has(String(selectedChat?.status || '').toUpperCase());
    }, [editableStatuses, isShopOpeningSelected, selectedChat]);

    const selectedCardDesignSnapshot = useMemo(() => {
        for (const message of selectedMessages) {
            if (message?.payload_type === 'FORM_SUBMITTED') {
                if (isValidWorkflowPayload('CARD_DESIGN', 'FORM_SUBMITTED', message.payload)) {
                    return message.payload.form_snapshot;
                }
            }
        }
        return null;
    }, [selectedMessages]);

    const selectedFormSnapshot = useMemo(() => {
        const metaSnapshot = selectedChat?.shop_opening_form_snapshot;
        if (isStrictShopOpeningSnapshot(metaSnapshot)) {
            return metaSnapshot;
        }

        for (const message of selectedMessages) {
            if (message?.payload_type !== 'FORM_SUBMITTED') {
                continue;
            }
            if (isValidWorkflowPayload('SHOP_OPENING', 'FORM_SUBMITTED', message.payload)) {
                return message.payload.form_snapshot;
            }
        }
        return null;
    }, [selectedChat, selectedMessages]);

    const handleShopOpeningApprove = async () => {
        if (!selectedChat?.chat_id || !selectedChat?.initiator_id?.startsWith('USER#')) {
            alert(t('inquiries.errors.invalidInitiator'));
            return;
        }
        if (isShopOpeningDecisionLocked) {
            alert(t('inquiries.errors.decisionLocked'));
            return;
        }
        if (!approveDesignId) {
            alert(t('inquiries.errors.designRequired'));
            return;
        }

        setShopOpenActionLoading(true);
        try {
            const ownerId = selectedChat.initiator_id.replace('USER#', '');
            const shopName = selectedFormSnapshot?.shop_name || t('inquiries.defaultShopName');

            const created = await adminApi.admin_shop_create({
                owner_id: ownerId,
                name: shopName,
            });

            await adminApi.admin_shop_carddesign_link_update({
                shop_id: created.shop_id,
                card_designs: [approveDesignId],
            });

            const reviewedAt = new Date().toISOString();
            await adminApi.fetch_post('/unified/chat/messages/send', {
                chat_id: selectedChat.chat_id,
                sender_id: 'ADMIN',
                type: 'WORKFLOW',
                message: t('inquiries.decision.approvedMessage'),
                payload_type: 'ADMIN_DECISION',
                workflow_status: 'APPROVED',
                payload: {
                    approved: true,
                    reason: adminMemo || undefined,
                    reviewer_id: 'ADMIN',
                    reviewed_at: reviewedAt,
                    linked_shop_id: created.shop_id,
                    default_design_id: approveDesignId,
                },
            });

            const latestChat = await adminApi.fetch_post('/unified/chat/get', {
                chat_id: selectedChat.chat_id,
            });
            const latestVersion = latestChat?.chat?.version;
            if (typeof latestVersion !== 'number') {
                throw new Error('latest chat version is missing');
            }

            await adminApi.fetch_post('/unified/chat/status/update', {
                chat_id: selectedChat.chat_id,
                next_status: 'APPROVED',
                expected_version: latestVersion,
            });

            setShopOpenDialogOpen(false);
            setApproveDesignId('');
            setRejectReason('');
            setAdminMemo('');
            await fetchNotifications();
        } catch (e: any) {
            console.error('approval failed', e);
            const detail = e?.message || e?.error || e?.statusText || '';
            alert(detail ? `${t('inquiries.errors.approveFailed')}\n${detail}` : t('inquiries.errors.approveFailed'));
        } finally {
            setShopOpenActionLoading(false);
        }
    };

    const handleShopOpeningReject = async () => {
        if (!selectedChat?.chat_id) {
            return;
        }
        if (isShopOpeningDecisionLocked) {
            alert(t('inquiries.errors.decisionLocked'));
            return;
        }
        if (!rejectReason.trim()) {
            alert(t('inquiries.errors.rejectReasonRequired'));
            return;
        }

        setShopOpenActionLoading(true);
        try {
            const reviewedAt = new Date().toISOString();

            await adminApi.fetch_post('/unified/chat/messages/send', {
                chat_id: selectedChat.chat_id,
                sender_id: 'ADMIN',
                type: 'WORKFLOW',
                message: t('inquiries.decision.rejectedMessage'),
                payload_type: 'ADMIN_DECISION',
                workflow_status: 'REJECTED',
                payload: {
                    approved: false,
                    reason: rejectReason.trim(),
                    reviewer_id: 'ADMIN',
                    reviewed_at: reviewedAt,
                },
            });

            const latestChat = await adminApi.fetch_post('/unified/chat/get', {
                chat_id: selectedChat.chat_id,
            });
            const latestVersion = latestChat?.chat?.version;
            if (typeof latestVersion !== 'number') {
                throw new Error('latest chat version is missing');
            }

            await adminApi.fetch_post('/unified/chat/status/update', {
                chat_id: selectedChat.chat_id,
                next_status: 'REJECTED',
                expected_version: latestVersion,
            });

            setShopOpenDialogOpen(false);
            setApproveDesignId('');
            setRejectReason('');
            setAdminMemo('');
            await fetchNotifications();
        } catch (e: any) {
            console.error('rejection failed', e);
            const detail = e?.message || e?.error || e?.statusText || '';
            alert(detail ? `${t('inquiries.errors.rejectFailed')}\n${detail}` : t('inquiries.errors.rejectFailed'));
        } finally {
            setShopOpenActionLoading(false);
        }
    };

    const getConfirmTerminalActionLabel = () => {
        if (confirmTerminalAction === 'APPROVED') {
            return t('inquiries.detail.approve');
        }
        if (confirmTerminalAction === 'REJECTED') {
            return t('inquiries.detail.reject');
        }
        return t('inquiryChat.actions.complete');
    };

    const handleConfirmTerminalAction = async () => {
        const action = confirmTerminalAction;
        if (!action) return;

        setConfirmTerminalAction(null);

        if (action === 'APPROVED') {
            await handleShopOpeningApprove();
            return;
        }

        if (action === 'REJECTED') {
            await handleShopOpeningReject();
            return;
        }

        await handleUpdateChatStatus('RESOLVED');
    };

    useEffect(() => {
        fetchNotifications();
    }, []);

    useEffect(() => {
        const fresh: (string | null)[] = [null];
        setChatPageCursors(fresh);
        setChatPageIdx(0);
        setChatHasNext(false);
        setChats([]);
        setShowPastChats(false);
        setPastChats([]);
        setPastCarry([]);
        setPastCursor(null);
        setPastHasNext(false);
        fetchPage(0, fresh);
    }, [chatPageSize]);

    return (
        <Card className="flex flex-col min-h-[70vh] gap-1 pt-3">
            <CardHeader className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-0 pb-0">
                <div>
                    <CardTitle>{t('inquiryChat.title')}</CardTitle>
                    <CardDescription>{t('inquiryChat.description')}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={fetchNotifications} disabled={notificationLoading}>
                        {notificationLoading ? t('inquiryChat.loading') : t('inquiryChat.refresh')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleFetchPastChats} disabled={pastLoading}>
                        {pastLoading
                            ? t('inquiryChat.loading')
                            : showPastChats
                                ? t('inquiryChat.fetchMorePast')
                                : t('inquiryChat.showPast')}
                    </Button>
                </div>
            </CardHeader>

            <CardContent
                className="grid grid-cols-1 xl:grid-cols-2 gap-0 flex-1 min-h-0 pt-0 mt-0 overflow-y-auto xl:grid-rows-1"
                style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
            >
                <Card className="flex flex-col h-[35rem] xl:h-[calc(100vh-5rem)]">
                    <CardHeader className="pb-0 justify-end">
                        {/* <div className="flex items-center gap-2">
                            <CardTitle>{t('inquiryChat.listTitle')}</CardTitle>
                        </div> */}
                        <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-500 mr-1">{t('inquiryChat.pageSize')}:</span>
                            {([5, 10, 25, 50] as const).map((s) => (
                                <button
                                    type="button"
                                    key={s}
                                    onClick={() => setChatPageSize(s)}
                                    className={`px-2 py-0.5 text-xs rounded border ${chatPageSize === s ? 'text-white' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                                    style={chatPageSize === s ? { backgroundColor: '#374151', borderColor: '#374151', color: '#ffffff' } : undefined}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </CardHeader>
                    <CardContent className="overflow-auto min-h-0 flex-1">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('inquiryChat.table.updatedAt')}</TableHead>
                                    <TableHead>{t('inquiryChat.table.type')}</TableHead>
                                    <TableHead>{t('inquiryChat.table.status')}</TableHead>
                                    <TableHead>{t('inquiryChat.table.unread')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {chats.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center text-gray-500">
                                            {t('inquiryChat.empty')}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    chats.map((chat) => (
                                        <TableRow
                                            key={chat.chat_id}
                                            className={`cursor-pointer hover:bg-gray-50 ${selectedChatId === chat.chat_id ? 'bg-blue-50 ring-1 ring-blue-200' : ''}`}
                                            onClick={() => openChatDetail(chat.chat_id)}
                                        >
                                            <TableCell>{chat.ts_last_message_at ? new Date(chat.ts_last_message_at).toLocaleString() : '-'}</TableCell>
                                            <TableCell>{getChatTypeLabel(chat.chat_type)}</TableCell>
                                            <TableCell>{getStatusLabel(chat.status)}</TableCell>
                                            <TableCell>{chat.unread_count_cache ?? 0}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                        <div className="mt-3 flex items-center justify-between">
                            <Button
                                variant="outline" size="sm"
                                onClick={() => fetchPage(chatPageIdx - 1)}
                                disabled={notificationLoading || chatPageIdx === 0}
                            >
                                {t('inquiryChat.prevPage')}
                            </Button>
                            <span className="text-xs text-gray-500">{chatPageIdx + 1} {t('inquiryChat.pageOf')}</span>
                            <Button
                                variant="outline" size="sm"
                                onClick={() => fetchPage(chatPageIdx + 1)}
                                disabled={notificationLoading || !chatHasNext}
                            >
                                {t('inquiryChat.nextPage')}
                            </Button>
                        </div>

                        {showPastChats && (
                            <div className="mt-6 border-t pt-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold text-gray-700">{t('inquiryChat.pastTitle')}</p>
                                    <Button variant="outline" size="sm" onClick={handleFetchPastChats} disabled={pastLoading || !pastHasNext}>
                                        {pastLoading ? t('inquiryChat.loading') : t('inquiryChat.fetchMorePast')}
                                    </Button>
                                </div>
                                {pastChats.length === 0 ? (
                                    <p className="text-xs text-gray-500">{t('inquiryChat.pastEmpty')}</p>
                                ) : (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>{t('inquiryChat.table.updatedAt')}</TableHead>
                                                <TableHead>{t('inquiryChat.table.type')}</TableHead>
                                                <TableHead>{t('inquiryChat.table.status')}</TableHead>
                                                <TableHead>{t('inquiryChat.table.unread')}</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {pastChats.map((chat) => (
                                                <TableRow
                                                    key={`past-${chat.chat_id}-${chat.ts_last_message_at || ''}`}
                                                    className={`cursor-pointer hover:bg-gray-50 ${selectedChatId === chat.chat_id ? 'bg-blue-50 ring-1 ring-blue-200' : ''}`}
                                                    onClick={() => openChatDetail(chat.chat_id)}
                                                >
                                                    <TableCell>{chat.ts_last_message_at ? new Date(chat.ts_last_message_at).toLocaleString() : '-'}</TableCell>
                                                    <TableCell>{getChatTypeLabel(chat.chat_type)}</TableCell>
                                                    <TableCell>{getStatusLabel(chat.status)}</TableCell>
                                                    <TableCell>{chat.unread_count_cache ?? 0}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="overflow-hidden flex flex-col h-[35rem] xl:h-[calc(100vh-5rem)]">
                    {/* <CardHeader>
                        <CardTitle>{t('inquiryChat.detailTitle')}</CardTitle>
                    </CardHeader> */}
                    <CardContent className="flex flex-col flex-1 min-h-0 space-y-4">
                        {!selectedChatId ? (
                            <p className="text-sm text-gray-500">{t('inquiryChat.selectPrompt')}</p>
                        ) : detailLoading ? (
                            <p className="text-sm text-gray-500">{t('inquiryChat.loading')}</p>
                        ) : (
                            <>
                                <div className="space-y-1 text-sm">
                                    <div><span className="text-gray-500">{t('inquiryChat.detail.chatId')}:</span> {selectedChat?.chat_id || '-'}</div>
                                    <div><span className="text-gray-500">{t('inquiryChat.detail.type')}:</span> {getChatTypeLabel(selectedChat?.chat_type)}</div>
                                    <div><span className="text-gray-500">{t('inquiryChat.detail.status')}:</span> {getStatusLabel(selectedChat?.status)}</div>
                                    <div><span className="text-gray-500">{t('inquiryChat.detail.updatedAt')}:</span> {selectedChat?.ts_last_message_at ? new Date(selectedChat.ts_last_message_at).toLocaleString() : '-'}</div>
                                    <div className="pt-1">
                                        <span className="text-gray-500">{t('inquiryChat.detail.participantsLabel')}:</span>
                                        <div className="mt-1 space-y-1">
                                            {selectedParticipantIds.length === 0 ? (
                                                <div className="text-xs text-gray-500">-</div>
                                            ) : (
                                                selectedParticipantIds.map((id: string) => {
                                                    return (
                                                        <div key={id} className="text-xs text-gray-700 break-all">
                                                            {toDisplayParticipantId(id)}
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {isShopOpeningSelected && (
                                    <Card className="border-amber-300 bg-amber-50">
                                        <CardHeader className="pb-3">
                                            <CardTitle className="text-base">{t('inquiries.shopcreationformcontent')}</CardTitle>
                                            <CardDescription>{t('inquiries.description')}</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-2 text-sm">
                                            <div><span className="text-gray-500">{t('inquiries.detail.initiator')}:</span> {selectedChat?.initiator_id || '-'}</div>
                                            <div><span className="text-gray-500">{t('inquiries.detail.shopName')}:</span> {selectedFormSnapshot?.shop_name || '-'}</div>
                                            <div><span className="text-gray-500">{t('inquiries.detail.ownerName')}:</span> {selectedFormSnapshot?.owner_name || '-'}</div>
                                            <div><span className="text-gray-500">{t('inquiries.detail.contactEmail')}:</span> {selectedFormSnapshot?.contact_email || '-'}</div>
                                            <div><span className="text-gray-500">{t('inquiries.detail.representativePhone')}:</span> {selectedFormSnapshot?.representative_phone || '-'}</div>
                                            <div className="min-w-0">
                                                <span className="text-gray-500">{t('inquiries.detail.notes')}:</span>
                                                <div className="mt-1 whitespace-pre-wrap break-all">{selectedFormSnapshot?.notes || '-'}</div>
                                            </div>
                                            <Button
                                                className="mt-2"
                                                size="sm"
                                                onClick={() => setShopOpenDialogOpen(true)}
                                            >
                                                {t('inquiryChat.shopOpeningActions')}
                                            </Button>
                                        </CardContent>
                                    </Card>
                                )}

                                {isCardDesignSelected && (
                                    <Card className="border-blue-300 bg-blue-50">
                                        <CardHeader className="pb-3">
                                            <CardTitle className="text-base">{t('inquiryChat.cardDesignActions')}</CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-2 text-sm">
                                            {selectedCardDesignSnapshot ? (
                                                <>
                                                    <div><span className="text-gray-500">{t('inquiries.detail.contactEmail')}:</span> {selectedCardDesignSnapshot.contact_email || '-'}</div>
                                                    <div><span className="text-gray-500">{t('inquiryChat.detail.designReady')}:</span> {selectedCardDesignSnapshot.design_ready ? t('inquiryChat.detail.yes') : t('inquiryChat.detail.no')}</div>
                                                    {selectedCardDesignSnapshot.reference_urls && (
                                                        <div className="min-w-0">
                                                            <span className="text-gray-500">{t('inquiryChat.detail.referenceUrls')}:</span>
                                                            <div className="mt-1">{renderTextWithLinks(selectedCardDesignSnapshot.reference_urls)}</div>
                                                        </div>
                                                    )}
                                                    {selectedCardDesignSnapshot.notes && (
                                                        <div className="min-w-0">
                                                            <span className="text-gray-500">{t('inquiries.detail.notes')}:</span>
                                                            <div className="mt-1 whitespace-pre-wrap break-all">{selectedCardDesignSnapshot.notes}</div>
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <p className="text-gray-400 text-xs">{t('inquiryChat.noFormSnapshot')}</p>
                                            )}
                                            {normalizeStatus(selectedChat?.status) === 'OPEN' && (
                                                <Button
                                                    className="mt-2"
                                                    size="sm"
                                                    disabled={statusUpdating}
                                                    onClick={() => setConfirmTerminalAction('RESOLVED')}
                                                >
                                                    {statusUpdating ? t('inquiryChat.updating') : getTransitionLabel('RESOLVED')}
                                                </Button>
                                            )}
                                        </CardContent>
                                    </Card>
                                )}

                                {!isShopOpeningSelected && visibleTransitions.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {visibleTransitions.map((nextStatus) => (
                                            <Button
                                                key={nextStatus}
                                                variant={nextStatus === 'RESOLVED' ? 'default' : 'outline'}
                                                size="sm"
                                                disabled={statusUpdating}
                                                onClick={() => {
                                                    if (nextStatus === 'RESOLVED') {
                                                        setConfirmTerminalAction('RESOLVED');
                                                        return;
                                                    }
                                                    handleUpdateChatStatus(nextStatus);
                                                }}
                                            >
                                                {statusUpdating ? t('inquiryChat.updating') : getTransitionLabel(nextStatus)}
                                            </Button>
                                        ))}
                                    </div>
                                )}


                                <div className="border-t border-gray-200"></div>
                                <div className="text-md font-semibold mb-0 ml-2">{t('inquiryChat.chat')}</div>

                                <div
                                    className="space-y-2 flex-1 min-h-0 max-h-[45vh] overflow-y-auto pr-1 overscroll-contain xl:max-h-none border rounded-md bg-gray-50 p-3"
                                    style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
                                >
                                    {selectedMessages.length === 0 ? (
                                        <p className="text-sm text-gray-500">{t('inquiryChat.noMessages')}</p>
                                    ) : (
                                        selectedMessages.map((message) => (
                                            <div key={message.message_id || `${message.seq}`} className="rounded-md border p-3 text-sm bg-white">
                                                <div className="mb-1 flex justify-between text-xs text-gray-500">
                                                    <span>{getSenderDisplayName(message)}</span>
                                                    <span>{message.ts_created_at ? new Date(message.ts_created_at).toLocaleString() : '-'}</span>
                                                </div>
                                                <div className="font-medium whitespace-pre-wrap break-words">{getDisplayMessage(message.message, (message as any).file_url)}</div>
                                                {(message as any).file_url && (
                                                    <ChatAttachment
                                                        fileUrl={(message as any).file_url}
                                                        fileName={(message as any).file_name}
                                                        fileSize={(message as any).file_size}
                                                    />
                                                )}
                                                {message.payload_type && (
                                                    <div className="mt-1 text-xs text-gray-500">{message.payload_type}</div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>


                                {isChatClosed ? (
                                    <p className="text-xs text-center text-gray-400 border rounded-md py-2">
                                        {t('inquiryChat.chatClosed')}
                                    </p>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        <Textarea
                                            value={inputMessage}
                                            onChange={(e) => setInputMessage(e.target.value)}
                                            placeholder={t('inquiryChat.messagePlaceholder')}
                                            rows={3}
                                            disabled={sendingMessage || uploading}
                                            className="resize-none"
                                        />
                                        {selectedFile && (
                                            <div className="flex items-center justify-between rounded-md border bg-slate-50 p-2 text-xs">
                                                <span className="truncate">{selectedFile.name}</span>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setSelectedFile(null)}
                                                    disabled={sendingMessage || uploading}
                                                >
                                                    {t('cancel')}
                                                </Button>
                                            </div>
                                        )}
                                        <input
                                            id="adminInquiryFile"
                                            type="file"
                                            className="hidden"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                if (file.size > 30 * 1024 * 1024) {
                                                    alert(t('inquiryChat.fileTooLarge'));
                                                    e.currentTarget.value = '';
                                                    return;
                                                }
                                                setSelectedFile(file);
                                                e.currentTarget.value = '';
                                            }}
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => document.getElementById('adminInquiryFile')?.click()}
                                            disabled={sendingMessage || uploading}
                                            className="w-full"
                                        >
                                            {t('inquiryChat.attachFile')}
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={sendFreeText}
                                            disabled={sendingMessage || uploading || (!inputMessage.trim() && !selectedFile)}
                                            className="w-full"
                                        >
                                            {uploading ? t('inquiryChat.uploading') : sendingMessage ? t('inquiryChat.sending') : t('inquiryChat.send')}
                                        </Button>
                                    </div>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>
            </CardContent>

            <Dialog open={shopOpenDialogOpen} onOpenChange={setShopOpenDialogOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{t('inquiries.detail.title')}</DialogTitle>
                        <DialogDescription>{selectedChat?.chat_id || ''}</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        {isShopOpeningDecisionLocked && (
                            <p className="text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                                {t('inquiries.detail.decisionLocked')}
                            </p>
                        )}

                        <Card>
                            <CardHeader>
                                <CardTitle>{t('inquiries.detail.requestInfo')}</CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-1 gap-3 text-sm">
                                <div><span className="text-gray-500">{t('inquiries.detail.initiator')}:</span> {selectedChat?.initiator_id || '-'}</div>
                                <div><span className="text-gray-500">{t('inquiries.detail.chatStatus')}:</span> {selectedChat?.status || '-'}</div>
                                <div><span className="text-gray-500">{t('inquiries.detail.shopName')}:</span> {selectedFormSnapshot?.shop_name || '-'}</div>
                                <div><span className="text-gray-500">{t('inquiries.detail.ownerName')}:</span> {selectedFormSnapshot?.owner_name || '-'}</div>
                                <div className="min-w-0 break-all"><span className="text-gray-500">{t('inquiries.detail.contactEmail')}:</span> {selectedFormSnapshot?.contact_email || '-'}</div>
                                <div><span className="text-gray-500">{t('inquiries.detail.representativePhone')}:</span> {selectedFormSnapshot?.representative_phone || '-'}</div>
                                <div><span className="text-gray-500">{t('inquiries.detail.notes')}:</span>{' '}</div>
                                <div><span className="whitespace-pre-wrap break-all">{selectedFormSnapshot?.notes || '-'}</span></div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>{t('inquiries.detail.approvalTitle')}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label>{t('inquiries.detail.defaultDesign')}</Label>
                                    <select
                                        className="w-full rounded-md p-2 text-sm border border-gray-200 shadow-sm text-black bg-white"
                                        value={approveDesignId}
                                        onChange={(e) => setApproveDesignId(e.target.value)}
                                        disabled={shopOpenActionLoading || isShopOpeningDecisionLocked}
                                    >
                                        <option value="">{t('inquiries.detail.selectDesign')}</option>
                                        {dbCardDesigns.map((d: any) => (
                                            <option key={d.design_id} value={d.design_id}>{d.name || d.design_id}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <Label>{t('inquiries.detail.adminMemo')}</Label>
                                    <Textarea
                                        value={adminMemo}
                                        onChange={(e) => setAdminMemo(e.target.value)}
                                        placeholder={t('inquiries.detail.adminMemoPlaceholder')}
                                        disabled={shopOpenActionLoading || isShopOpeningDecisionLocked}
                                    />
                                </div>

                                <Button onClick={() => setConfirmTerminalAction('APPROVED')} disabled={shopOpenActionLoading || isShopOpeningDecisionLocked}>
                                    {shopOpenActionLoading ? t('inquiries.detail.processing') : t('inquiries.detail.approve')}
                                </Button>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>{t('inquiries.detail.rejectTitle')}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <Label>{t('inquiries.detail.rejectReason')}</Label>
                                <Textarea
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    placeholder={t('inquiries.detail.rejectReasonPlaceholder')}
                                    disabled={shopOpenActionLoading || isShopOpeningDecisionLocked}
                                />
                                <Button variant="destructive" onClick={() => setConfirmTerminalAction('REJECTED')} disabled={shopOpenActionLoading || isShopOpeningDecisionLocked}>
                                    {shopOpenActionLoading ? t('inquiries.detail.processing') : t('inquiries.detail.reject')}
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={confirmTerminalAction !== null} onOpenChange={(open) => {
                if (!open) setConfirmTerminalAction(null);
            }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('inquiryChat.confirmTerminalActionTitle')}</DialogTitle>
                        <DialogDescription>{t('inquiryChat.confirmTerminalActionDescription')}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmTerminalAction(null)}>
                            {t('cancel')}
                        </Button>
                        <Button onClick={handleConfirmTerminalAction}>
                            {getConfirmTerminalActionLabel()}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}

/**
 * ショップ開設申請（SHOP_OPENING）を管理者が審査する専用セクション。
 *
 * 役割:
 * - ADMIN 参加者として unified_chat/list を取得し、審査待ち案件を一覧表示
 * - 詳細ダイアログで申請内容・履歴を確認
 * - 承認時: ショップ作成 + デザイン紐付け + ADMIN_DECISION 送信 + APPROVED 化
 * - 却下時: ADMIN_DECISION(REJECTED) 送信 + REJECTED 化
 */
function ShopOpeningInquirySection({ dbCardDesigns }: { dbCardDesigns: any[] }) {
    const t = useTranslations('AdminPage');
    const [loading, setLoading] = useState(false);
    const [requests, setRequests] = useState<any[]>([]);
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState<any>(null);
    const [selectedMeta, setSelectedMeta] = useState<any>(null);
    const [selectedMessages, setSelectedMessages] = useState<any[]>([]);
    const [actionLoading, setActionLoading] = useState(false);
    const [approveDesignId, setApproveDesignId] = useState('');
    const [rejectReason, setRejectReason] = useState('');
    const [adminMemo, setAdminMemo] = useState('');
    const [replyMessage, setReplyMessage] = useState('');
    const [replyLoading, setReplyLoading] = useState(false);
    const [replyFile, setReplyFile] = useState<File | null>(null);
    const [replyUploading, setReplyUploading] = useState(false);
    const editableStatuses = new Set(['OPEN']);
    const isDecisionLocked = !!selectedMeta && !editableStatuses.has(String(selectedMeta.status || '').toUpperCase());

    /**
     * 申請フォームのスナップショットを取得します。
     *
     * 参照優先順:
     * 1. chat meta に保持された shop_opening_form_snapshot
     * 2. FORM_SUBMITTED メッセージ payload の form_snapshot
     *
     * 理由:
     * - 既存データ移行中でも管理画面表示を安定させるため、複数の保存位置を許容します。
     */
    const selectedFormSnapshot = useMemo(() => {
        const metaSnapshot = selectedMeta?.shop_opening_form_snapshot;
        if (isStrictShopOpeningSnapshot(metaSnapshot)) {
            return metaSnapshot;
        }

        for (const message of selectedMessages) {
            if (message?.payload_type !== 'FORM_SUBMITTED') {
                continue;
            }

            if (isValidWorkflowPayload('SHOP_OPENING', 'FORM_SUBMITTED', message.payload)) {
                return message.payload.form_snapshot;
            }
        }
        return null;
    }, [selectedMessages, selectedMeta]);

    const selectedParticipantIds = useMemo(() => {
        return Array.isArray(selectedMeta?.participants) ? selectedMeta.participants : [];
    }, [selectedMeta]);

    const getSenderDisplayName = (message: any): string => {
        const senderId = String(message?.sender_id || '');
        if (senderId.startsWith('ADMIN')) {
            return t('inquiryChat.adminLabel');
        }
        return toDisplayParticipantId(senderId);
    };

    /**
     * 審査対象一覧を取得します。
     * ADMIN を participant_id として絞ることで、管理者向け受信箱のみを対象にします。
     */
    const fetchRequests = async () => {
        setLoading(true);
        try {
            const data = await adminApi.fetch_post('/unified/chat/list', {
                participant_id: 'ADMIN',
                chat_type: 'SHOP_OPENING',
                include_archived: false,
                limit: 100,
            });
            setRequests(data.items || []);
        } catch (e) {
            console.error('failed to fetch shop opening inquiries', e);
        } finally {
            setLoading(false);
        }
    };

    const loadInquiryDetails = async (chatId: string) => {
        const [chatRes, msgRes] = await Promise.all([
            adminApi.fetch_post('/unified/chat/get', { chat_id: chatId }),
            adminApi.fetch_post('/unified/chat/messages/get', { chat_id: chatId, limit: 200 }),
        ]);
        setSelectedMeta(chatRes.chat || null);
        setSelectedMessages((msgRes.messages || []).slice().reverse());
    };

    useEffect(() => {
        fetchRequests();
    }, []);

    /**
     * 一覧行クリック時に詳細ダイアログを開き、meta/messages を並列取得します。
     * messages は新しい順で返るため reverse して古い順表示に揃えます。
     */
    const openDetails = async (item: any) => {
        setOpen(true);
        setSelected(item);
        setSelectedMeta(null);
        setSelectedMessages([]);
        setApproveDesignId('');
        setRejectReason('');
        setAdminMemo('');
        setReplyMessage('');
        setReplyFile(null);

        try {
            await loadInquiryDetails(item.chat_id);
        } catch (e) {
            console.error('failed to load inquiry details', e);
        }
    };

    const handleSendReply = async () => {
        const message = replyMessage.trim();
        const hasFile = !!replyFile;
        if (!selectedMeta?.chat_id || (!message && !hasFile) || replyLoading || replyUploading || isDecisionLocked) {
            return;
        }

        setReplyLoading(true);
        try {
            let fileData: ChatFileData | null = null;

            if (replyFile) {
                setReplyUploading(true);
                try {
                    fileData = await uploadChatFile(adminApi.fetch_post.bind(adminApi), selectedMeta.chat_id, replyFile);
                } finally {
                    setReplyUploading(false);
                }
            }

            await adminApi.fetch_post('/unified/chat/messages/send', {
                chat_id: selectedMeta.chat_id,
                sender_id: 'ADMIN',
                type: fileData ? 'FILE' : 'TEXT',
                message: message || '',
                ...fileData,
            });

            setReplyMessage('');
            setReplyFile(null);
            await Promise.all([
                loadInquiryDetails(selectedMeta.chat_id),
                fetchRequests(),
            ]);
        } catch (e: any) {
            console.error('failed to send inquiry reply', e);
            const detail = e?.message || e?.error || e?.statusText || '';
            alert(detail ? `${t('inquiries.detail.sendFailed')}\n${detail}` : t('inquiries.detail.sendFailed'));
        } finally {
            setReplyLoading(false);
        }
    };

    /**
     * 承認処理のトランザクション手順（アプリケーション層）:
     * 1. admin_shop_create でショップを発行
     * 2. admin_shop_carddesign_link_update で初期デザインを付与
     * 3. unified_chat/messages/send で ADMIN_DECISION(APPROVED) を送信
        * 4. unified_chat/status/update でチャットを APPROVED に更新
     *
     * 途中失敗時は catch で即通知し、UIは actionLoading を解除します。
     */
    const handleApprove = async () => {
        if (isDecisionLocked) {
            alert(t('inquiries.errors.decisionLocked'));
            return;
        }
        if (!selectedMeta?.initiator_id?.startsWith('USER#')) {
            alert(t('inquiries.errors.invalidInitiator'));
            return;
        }
        if (!approveDesignId) {
            alert(t('inquiries.errors.designRequired'));
            return;
        }

        setActionLoading(true);
        try {
            const ownerId = selectedMeta.initiator_id.replace('USER#', '');
            const shopName = selectedFormSnapshot?.shop_name || t('inquiries.defaultShopName');

            const created = await adminApi.admin_shop_create({
                owner_id: ownerId,
                name: shopName,
            });

            await adminApi.admin_shop_carddesign_link_update({
                shop_id: created.shop_id,
                card_designs: [approveDesignId],
            });

            const reviewedAt = new Date().toISOString();
            await adminApi.fetch_post('/unified/chat/messages/send', {
                chat_id: selectedMeta.chat_id,
                sender_id: 'ADMIN',
                type: 'WORKFLOW',
                message: t('inquiries.decision.approvedMessage'),
                payload_type: 'ADMIN_DECISION',
                workflow_status: 'APPROVED',
                payload: {
                    approved: true,
                    reason: adminMemo || undefined,
                    reviewer_id: 'ADMIN',
                    reviewed_at: reviewedAt,
                    linked_shop_id: created.shop_id,
                    default_design_id: approveDesignId,
                },
            });

            const latestChat = await adminApi.fetch_post('/unified/chat/get', {
                chat_id: selectedMeta.chat_id,
            });
            const latestVersion = latestChat?.chat?.version;
            if (typeof latestVersion !== 'number') {
                throw new Error('latest chat version is missing');
            }

            await adminApi.fetch_post('/unified/chat/status/update', {
                chat_id: selectedMeta.chat_id,
                next_status: 'APPROVED',
                expected_version: latestVersion,
            });

            await fetchRequests();
            setOpen(false);
        } catch (e: any) {
            console.error('approval failed', e);
            const detail = e?.message || e?.error || e?.statusText || '';
            alert(detail ? `${t('inquiries.errors.approveFailed')}\n${detail}` : t('inquiries.errors.approveFailed'));
        } finally {
            setActionLoading(false);
        }
    };

    /**
     * 却下処理:
     * - ADMIN_DECISION(REJECTED) メッセージを送信
        * - チャットステータスを REJECTED に更新
     */
    const handleReject = async () => {
        if (isDecisionLocked) {
            alert(t('inquiries.errors.decisionLocked'));
            return;
        }
        if (!rejectReason.trim()) {
            alert(t('inquiries.errors.rejectReasonRequired'));
            return;
        }
        if (!selectedMeta) return;

        setActionLoading(true);
        try {
            const reviewedAt = new Date().toISOString();

            await adminApi.fetch_post('/unified/chat/messages/send', {
                chat_id: selectedMeta.chat_id,
                sender_id: 'ADMIN',
                type: 'WORKFLOW',
                message: t('inquiries.decision.rejectedMessage'),
                payload_type: 'ADMIN_DECISION',
                workflow_status: 'REJECTED',
                payload: {
                    approved: false,
                    reason: rejectReason.trim(),
                    reviewer_id: 'ADMIN',
                    reviewed_at: reviewedAt,
                },
            });

            const latestChat = await adminApi.fetch_post('/unified/chat/get', {
                chat_id: selectedMeta.chat_id,
            });
            const latestVersion = latestChat?.chat?.version;
            if (typeof latestVersion !== 'number') {
                throw new Error('latest chat version is missing');
            }

            await adminApi.fetch_post('/unified/chat/status/update', {
                chat_id: selectedMeta.chat_id,
                next_status: 'REJECTED',
                expected_version: latestVersion,
            });

            await fetchRequests();
            setOpen(false);
        } catch (e: any) {
            console.error('rejection failed', e);
            const detail = e?.message || e?.error || e?.statusText || '';
            alert(detail ? `${t('inquiries.errors.rejectFailed')}\n${detail}` : t('inquiries.errors.rejectFailed'));
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <Card className="w-full">
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>{t('inquiries.shopcreationformcontent')}</CardTitle>
                    <CardDescription>{t('inquiries.description')}</CardDescription>
                </div>
                <Button variant="outline" onClick={fetchRequests} disabled={loading}>
                    {loading ? t('inquiries.loading') : t('inquiries.refresh')}
                </Button>
            </CardHeader>
            <CardContent>
                <Table wrapperClassName="max-h-[65vh] overflow-auto">
                    <TableHeader className="sticky top-0 bg-white z-10">
                        <TableRow>
                            <TableHead>{t('inquiries.table.updatedAt')}</TableHead>
                            <TableHead>{t('inquiries.table.chatId')}</TableHead>
                            <TableHead>{t('inquiries.table.status')}</TableHead>
                            <TableHead>{t('inquiries.table.unread')}</TableHead>
                            <TableHead>{t('inquiries.table.preview')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {requests.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center text-gray-500">
                                    {t('inquiries.empty')}
                                </TableCell>
                            </TableRow>
                        ) : (
                            requests.map((item: any) => (
                                <TableRow key={item.chat_id} className="cursor-pointer hover:bg-gray-50" onClick={() => openDetails(item)}>
                                    <TableCell>{item.ts_last_message_at ? new Date(item.ts_last_message_at).toLocaleString() : '-'}</TableCell>
                                    <TableCell className="font-mono text-xs">{item.chat_id}</TableCell>
                                    <TableCell>{item.status || '-'}</TableCell>
                                    <TableCell>{item.unread_count_cache ?? 0}</TableCell>
                                    <TableCell className="max-w-[420px] truncate">{item.last_message_text || '-'}</TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </CardContent>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden p-0 flex flex-col">
                    <DialogHeader className="border-b p-6">
                        <DialogTitle>{t('inquiries.detail.title')}</DialogTitle>
                        <DialogDescription>{selectedMeta?.chat_id || ''}</DialogDescription>
                    </DialogHeader>

                    <div
                        className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6 overscroll-contain"
                        style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
                    >
                        <Card>
                            <CardHeader>
                                <CardTitle>{t('inquiries.detail.requestInfo')}</CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                <div><span className="text-gray-500">{t('inquiries.detail.initiator')}:</span> {selectedMeta?.initiator_id || '-'}</div>
                                <div><span className="text-gray-500">{t('inquiries.detail.chatStatus')}:</span> {selectedMeta?.status || '-'}</div>
                                <div><span className="text-gray-500">{t('inquiries.detail.shopName')}:</span> {selectedFormSnapshot?.shop_name || '-'}</div>
                                <div><span className="text-gray-500">{t('inquiries.detail.ownerName')}:</span> {selectedFormSnapshot?.owner_name || '-'}</div>
                                <div><span className="text-gray-500">{t('inquiries.detail.contactEmail')}:</span> {selectedFormSnapshot?.contact_email || '-'}</div>
                                <div><span className="text-gray-500">{t('inquiries.detail.representativePhone')}:</span> {selectedFormSnapshot?.representative_phone || '-'}</div>
                                <div><span className="text-gray-500">{t('inquiries.detail.notes')}:</span> {selectedFormSnapshot?.notes || '-'}</div>
                                <div className="md:col-span-2">
                                    <span className="text-gray-500">{t('inquiries.detail.participantsLabel')}:</span>
                                    <div className="mt-1 space-y-1">
                                        {selectedParticipantIds.length === 0 ? (
                                            <div className="text-xs text-gray-500">-</div>
                                        ) : (
                                            selectedParticipantIds.map((id: string) => {
                                                return (
                                                    <div key={id} className="text-xs text-gray-700 break-all">
                                                        {toDisplayParticipantId(id)}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>{t('inquiries.detail.approvalTitle')}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {isDecisionLocked && (
                                    <p className="text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                                        {t('inquiries.detail.decisionLocked')}
                                    </p>
                                )}
                                <div className="space-y-2">
                                    <Label>{t('inquiries.detail.defaultDesign')}</Label>
                                    <select
                                        className="w-full rounded-md p-2 text-sm border border-gray-200 shadow-sm text-black bg-white"
                                        value={approveDesignId}
                                        onChange={(e) => setApproveDesignId(e.target.value)}
                                        disabled={actionLoading || isDecisionLocked}
                                    >
                                        <option value="">{t('inquiries.detail.selectDesign')}</option>
                                        {dbCardDesigns.map((d: any) => (
                                            <option key={d.design_id} value={d.design_id}>{d.name || d.design_id}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <Label>{t('inquiries.detail.adminMemo')}</Label>
                                    <Textarea
                                        value={adminMemo}
                                        onChange={(e) => setAdminMemo(e.target.value)}
                                        placeholder={t('inquiries.detail.adminMemoPlaceholder')}
                                        disabled={actionLoading || isDecisionLocked}
                                    />
                                </div>

                                <Button onClick={handleApprove} disabled={actionLoading || isDecisionLocked} className="w-full md:w-auto">
                                    {actionLoading ? t('inquiries.detail.processing') : t('inquiries.detail.approve')}
                                </Button>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>{t('inquiries.detail.rejectTitle')}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <Label>{t('inquiries.detail.rejectReason')}</Label>
                                <Textarea
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    placeholder={t('inquiries.detail.rejectReasonPlaceholder')}
                                    disabled={actionLoading || isDecisionLocked}
                                />
                                <Button variant="destructive" onClick={handleReject} disabled={actionLoading || isDecisionLocked}>
                                    {actionLoading ? t('inquiries.detail.processing') : t('inquiries.detail.reject')}
                                </Button>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>{t('inquiries.detail.messageHistory')}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div
                                    className="space-y-2 max-h-[300px] overflow-y-auto overscroll-contain"
                                    style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
                                >
                                    {selectedMessages.length === 0 ? (
                                        <p className="text-sm text-gray-500">{t('inquiries.detail.noMessages')}</p>
                                    ) : (
                                        selectedMessages.map((msg: any) => (
                                            <div key={msg.message_id || `${msg.seq}`} className="border rounded-md p-2 text-sm">
                                                <div className="flex justify-between text-xs text-gray-500 mb-1">
                                                    <span>{getSenderDisplayName(msg)}</span>
                                                    <span>{msg.ts_created_at ? new Date(msg.ts_created_at).toLocaleString() : '-'}</span>
                                                </div>
                                                <div className="font-medium">{getDisplayMessage(msg.message, msg.file_url)}</div>
                                                {msg.file_url && (
                                                    <ChatAttachment
                                                        fileUrl={msg.file_url}
                                                        fileName={msg.file_name}
                                                        fileSize={msg.file_size}
                                                    />
                                                )}
                                                {msg.payload_type && (
                                                    <pre className="mt-1 text-xs whitespace-pre-wrap text-gray-600">{JSON.stringify(msg.payload, null, 2)}</pre>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>{t('inquiries.detail.replyTitle')}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {isDecisionLocked ? (
                                    <p className="text-sm text-gray-500">{t('inquiries.detail.chatClosed')}</p>
                                ) : (
                                    <>
                                        <Textarea
                                            value={replyMessage}
                                            onChange={(e) => setReplyMessage(e.target.value)}
                                            placeholder={t('inquiries.detail.messagePlaceholder')}
                                            disabled={replyLoading || replyUploading || actionLoading}
                                            rows={4}
                                        />
                                        {replyFile && (
                                            <div className="flex items-center justify-between rounded-md border bg-slate-50 p-2 text-xs">
                                                <span className="truncate">{replyFile.name}</span>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setReplyFile(null)}
                                                    disabled={replyLoading || replyUploading || actionLoading}
                                                >
                                                    {t('cancel')}
                                                </Button>
                                            </div>
                                        )}
                                        <input
                                            id="shopOpeningReplyFile"
                                            type="file"
                                            className="hidden"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                if (file.size > 30 * 1024 * 1024) {
                                                    alert(t('inquiryChat.fileTooLarge'));
                                                    e.currentTarget.value = '';
                                                    return;
                                                }
                                                setReplyFile(file);
                                                e.currentTarget.value = '';
                                            }}
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => document.getElementById('shopOpeningReplyFile')?.click()}
                                            disabled={replyLoading || replyUploading || actionLoading}
                                        >
                                            {t('inquiryChat.attachFile')}
                                        </Button>
                                        <Button
                                            onClick={handleSendReply}
                                            disabled={replyLoading || replyUploading || actionLoading || (!replyMessage.trim() && !replyFile)}
                                        >
                                            {replyUploading ? t('inquiryChat.uploading') : replyLoading ? t('inquiries.detail.sending') : t('inquiries.detail.send')}
                                        </Button>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    <DialogFooter className="border-t p-4">
                        <Button variant="outline" onClick={() => setOpen(false)}>{t('inquiries.detail.close')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}

/**
 * QRコード一覧セクション
 * ステータス別の表示切り替え、キーワード検索、CSVエクスポート機能を提供します。
 */
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

    /** 表示密度の状態（通常 / コンパクト） */
    const isDense = isDenseManual !== null ? isDenseManual : (codes.length > 30);

    /**
     * 現在表示されているQRコード一覧をCSV形式でエクスポートします。
     */
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
            const qr_id = item.qr_id || item.PK?.replace('QR#', '');
            const statusLabel = st(item.status ? item.status.toLowerCase() : 'active');
            const updatedAt = item.ts_updated_at ? new Date(item.ts_updated_at).toLocaleString() : '-';
            const email = item.shipping_info?.email || '-';
            const phone = item.shipping_info?.phone || '-';
            const contact = `${email}${phone !== '-' ? ' / ' + phone : ''}`;
            const preferredDateTime = `${item.preferred_date ? item.preferred_date : '-'} / ${item.preferred_time ? (tt.has(item.preferred_time) ? tt(item.preferred_time) : item.preferred_time) : '-'}`;

            return [
                qr_id,
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

    /**
     * 指定されたステータスまたは検索キーワードに基づいてQRコードを取得します。
     * 表示パフォーマンスとコストのため、1回の取得を50件に制限しています。
     */
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

    /**
     * BANNED ステータスのQRコードをすべて一括削除します（管理者用）。
     */
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

/**
 * QRコード一覧の各行コンポーネント
 * クリックで詳細ダイアログを表示し、各種メタデータの確認とBAN/復元が可能です。
 */
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

    const qr_id = item.qr_id || item.PK?.replace('QR#', '');

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
                        {qr_id}
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
                                    onClick={() => handleCopy(qr_id)}
                                >
                                    {copiedId === qr_id ? (
                                        <Check className="h-3 w-3 text-green-500" />
                                    ) : (
                                        <Copy className="h-3 w-3" />
                                    )}
                                </Button>
                                <ExternalLink className="cursor-pointer w-4 h-4 shrink-0" onClick={() => window.open(`/${locale}/receive/${qr_id}`, '_blank')} />
                                {qr_id}
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
                                            <Link href={`/shop/${item.shop_id}`} target="_blank" rel="noopener noreferrer">
                                                <ExternalLink className="w-3 h-3 text-mist-500 hover:text-mist-900 cursor-pointer shrink-0" />
                                            </Link>
                                        </>
                                    )}
                                </div>

                                <span className="text-gray-400 text-xs">{t('shopInfo.contact')}</span>
                                <span className="text-gray-600 break-all">{item.shop_email || '-'}</span>
                                <span className="text-gray-400 text-xs">{tShop('orders.productName')}</span>
                                <div className="flex items-center gap-1">
                                    <span className="text-gray-600 break-all">{item.product_name || item.product_id || '-'}</span>
                                    {item.product_id && (
                                        <Button variant="ghost" size="icon" className="h-4 w-4" onClick={(e) => { e.stopPropagation(); handleCopy(item.product_id); }}>
                                            {copiedId === item.product_id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-gray-400" />}
                                        </Button>
                                    )}
                                </div>
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
                        {item.design_id && (
                            <div className="space-y-2">
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-500">{t('generate.cardFormat')}</h4>
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-medium font-mono">{item.design_id}</p>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-4 w-4"
                                            onClick={(e) => { e.stopPropagation(); handleCopy(item.design_id); }}
                                        >
                                            {copiedId === item.design_id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-gray-400" />}
                                        </Button>
                                    </div>
                                </div>
                                {(item.thumbf || item.thumbb || cardformats[item.design_id]) && (
                                    <div className="flex flex-wrap gap-4">
                                        <div className="space-y-1">
                                            <div
                                                className="relative rounded shadow-sm overflow-hidden border border-gray-100 bg-white h-24"
                                                style={{ aspectRatio: (dbCardDesigns.find(d => d.design_id === item.design_id)?.width && dbCardDesigns.find(d => d.design_id === item.design_id)?.height) ? `${dbCardDesigns.find(d => d.design_id === item.design_id).width} / ${dbCardDesigns.find(d => d.design_id === item.design_id).height}` : '84 / 52' }}
                                            >
                                                <img
                                                    src={item.thumbf || dbCardDesigns.find(d => d.design_id === item.design_id)?.thumbf || dbCardDesigns.find(d => d.design_id === item.design_id)?.bgimgf || cardformats[item.design_id]?.bgimgf}
                                                    alt="Front"
                                                    className="w-full h-full object-fill select-none"
                                                    draggable={false}
                                                    crossOrigin="anonymous"
                                                />
                                            </div>
                                            <p className="text-[9px] text-gray-400 text-center uppercase tracking-tighter">{t('generate.front')}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <div
                                                className="relative rounded shadow-sm overflow-hidden border border-gray-100 bg-white h-24"
                                                style={{ aspectRatio: (dbCardDesigns.find(d => d.design_id === item.design_id)?.width && dbCardDesigns.find(d => d.design_id === item.design_id)?.height) ? `${dbCardDesigns.find(d => d.design_id === item.design_id).width} / ${dbCardDesigns.find(d => d.design_id === item.design_id).height}` : '84 / 52' }}
                                            >
                                                <img
                                                    src={item.thumbb || dbCardDesigns.find(d => d.design_id === item.design_id)?.thumbb || dbCardDesigns.find(d => d.design_id === item.design_id)?.bgimgb || cardformats[item.design_id]?.bgimgb}
                                                    alt="Back"
                                                    className="w-full h-full object-fill select-none"
                                                    draggable={false}
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
                                {item.receiver_user_id && (
                                    <div className="mt-2 group/userid">
                                        <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-tighter">{t('table.receiverUserId')}</h4>
                                        <div className="flex items-center gap-1">
                                            <p className="text-xs font-mono text-gray-600 truncate">{item.receiver_user_id}</p>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-4 w-4 opacity-0 group-hover/userid:opacity-100 transition-all"
                                                onClick={(e) => { e.stopPropagation(); handleCopy(item.receiver_user_id); }}
                                            >
                                                {copiedId === item.receiver_user_id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-gray-400" />}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div>
                                <h4 className="text-sm font-semibold text-gray-500">{tShop('orders.contact')}</h4>
                                <div className="flex items-center gap-1">
                                    <p className="break-all">{item.shipping_info?.email || '-'}</p>
                                    {item.shipping_info?.email && (
                                        <Button variant="ghost" size="icon" className="h-4 w-4" onClick={(e) => { e.stopPropagation(); handleCopy(item.shipping_info.email); }}>
                                            {copiedId === item.shipping_info.email ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-gray-400" />}
                                        </Button>
                                    )}
                                </div>
                                <div className="flex items-center gap-1">
                                    <p className="text-sm mt-1">{item.shipping_info?.phone || '-'}</p>
                                    {item.shipping_info?.phone && (
                                        <Button variant="ghost" size="icon" className="h-4 w-4" onClick={(e) => { e.stopPropagation(); handleCopy(item.shipping_info.phone); }}>
                                            {copiedId === item.shipping_info.phone ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-gray-400" />}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div>
                            <h4 className="text-sm font-semibold text-gray-500">{tShop('orders.address')}</h4>
                            {item.postal_code && (
                                <div className="flex items-center gap-1">
                                    <p className="text-sm">〒{item.postal_code}</p>
                                    <Button variant="ghost" size="icon" className="h-4 w-4" onClick={(e) => { e.stopPropagation(); handleCopy(item.postal_code); }}>
                                        {copiedId === item.postal_code ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-gray-400" />}
                                    </Button>
                                </div>
                            )}
                            <div className="flex items-center gap-1">
                                <p className="whitespace-pre-wrap text-sm">{item.address || '-'}</p>
                                {item.address && (
                                    <Button variant="ghost" size="icon" className="h-4 w-4" onClick={(e) => { e.stopPropagation(); handleCopy(item.address); }}>
                                        {copiedId === item.address ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-gray-400" />}
                                    </Button>
                                )}
                            </div>
                        </div>

                        <div>
                            <h4 className="text-sm font-semibold text-gray-500">{tShop('orders.preferredDateTime')}</h4>
                            <p className="text-sm">{item.preferred_date ? item.preferred_date : '-'}  /  {item.preferred_time ? (tt.has(item.preferred_time) ? tt(item.preferred_time) : item.preferred_time) : '-'}</p>
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
                            {(Object.entries(item).filter(([k]) => !k.startsWith('ts_') && k !== 'shipping_info' && !k.startsWith('GSI') && k !== 'PK' && k !== 'SK')
                                .concat(Object.entries(item.shipping_info || {}).map(([k, v]) => [`shipping_${k}`, v]))
                                .concat(Object.entries(item).filter(([k]) => k.startsWith('ts_')))
                                .concat(Object.entries(item).filter(([k]) => k.startsWith('GSI') || k === 'PK' || k === 'SK')) as [string, any][]).map(([key, value]) => (
                                    <div key={key} className="flex flex-col py-1 border-b border-gray-50 last:border-0 group/raw">
                                        <div className="flex items-center justify-between gap-2">
                                            <h4 className="text-[10px] font-bold text-gray-400 font-mono uppercase truncate w-24 shrink-0">{key}</h4>
                                            <div className="flex-1 flex items-center justify-end gap-1 min-w-0">
                                                <p className="text-[11px] font-mono text-gray-600 truncate text-right">
                                                    {value == null ? '-' : typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                                </p>
                                                {value != null && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-5 w-5 opacity-0 group-hover/raw:opacity-100 transition-opacity shrink-0"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleCopy(typeof value === 'object' ? JSON.stringify(value) : String(value));
                                                        }}
                                                    >
                                                        {copiedId === (typeof value === 'object' ? JSON.stringify(value) : String(value)) ? (
                                                            <Check className="h-3 w-3 text-green-500" />
                                                        ) : (
                                                            <Copy className="h-3 w-3 text-gray-400" />
                                                        )}
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
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
                                    const targetId = item.design_id || cardFormat;
                                    const dbDesign = dbCardDesigns.find(d => d.design_id === targetId);
                                    if (dbDesign) return dbDesign;
                                    if (cardformats[targetId]) return targetId;
                                    const globalDesign = dbCardDesigns.find(d => d.design_id === cardFormat);
                                    return globalDesign || cardFormat;
                                };
                                const design = resolveDesign(item.design_id);
                                onGeneratePDF({
                                    id: qr_id,
                                    codes: [{ qr_id, pin: item.pin }]
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
                                    const targetId = item.design_id || cardFormat;
                                    const dbDesign = dbCardDesigns.find(d => d.design_id === targetId);
                                    if (dbDesign) return dbDesign;
                                    if (cardformats[targetId]) return targetId;
                                    const globalDesign = dbCardDesigns.find(d => d.design_id === cardFormat);
                                    return globalDesign || cardFormat;
                                };
                                const design = resolveDesign(item.design_id);
                                await generateCSVExport({
                                    id: qr_id,
                                    codes: [{ qr_id, pin: item.pin }]
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
                                qr_id={qr_id}
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
                                qr_id={qr_id}
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
                                        await adminApi.admin_qr_deleteban({ target: qr_id });
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

/**
 * QRコードのBAN / 復元を実行するボタンコンポーネント。
 * BAN時には理由（メモ）の入力を求めます。
 */
function BanButton({ qr_id, apiUrl, onSuccess, size = "sm", className, isBanned = false }: {
    qr_id: string,
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
            const params: any = { qr_id: qr_id };
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

/**
 * システムデバッグ用データダンプセクション。
 * 特定のプレフィックス（PK）を指定してDynamoDBのアイテムを直接参照します。
 */
function DataDumpSection({ apiUrl }: { apiUrl: string }) {
    const t = useTranslations('AdminPage');

    return (
        <>
            <DumpCard title={t('list.dump.userId')} prefix="USER#" />
            <DumpCard title={t('list.dump.shopId')} prefix="SHOP#" />
            <DumpCard
                title={t('list.dump.productId')}
                prefix="PRODUCT#"
                skPrefix="GSI 2;PRODUCT#"
                isGsi2
            />
            <DumpCard title="QR" prefix="QR#" />
            <DumpCard
                title="Card Order"
                prefix="CARD_ORDER#"
                skPrefix="GSI 2;CARD_ORDER#"
                isGsi2
            />
            <DumpCard title="QR Batch" prefix="QR_BATCH#" />
            <DumpCard
                title="Card Design"
                prefix="CARD_DESIGN#METADATA"
                skPrefix="PK: CARD_DESIGN#METADATA, SK: "
                useSk
            />
        </>
    );
}

function DumpCard({
    title,
    prefix,
    skPrefix,
    defaultValue = "",
    useSk = false,
    isGsi2 = false
}: {
    title: string,
    prefix: string,
    skPrefix?: string,
    defaultValue?: string,
    useSk?: boolean,
    isGsi2?: boolean
}) {
    const t = useTranslations('AdminPage');
    const [id, setId] = useState(defaultValue);
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const handleDump = async () => {
        if (!id.trim()) return;
        setLoading(true);
        try {
            const val = id.trim();
            const pk = `${prefix}${(!useSk && !isGsi2) ? val : ""}`;
            const sk = useSk ? val : undefined;
            const gsi2_pk = isGsi2 ? `${prefix}${val}` : undefined;

            const result = await adminApi.admin_dump(
                gsi2_pk
                    ? { gsi2_pks: [gsi2_pk] }
                    : sk
                        ? { keys: [{ pk, sk }] }
                        : { pks: [pk] }
            );
            setData(result.items);
        } catch (e) {
            alert(t('list.dump.error'));
        } finally {
            setLoading(false);
        }
    };

    const handleClear = () => {
        setId(defaultValue);
        setData(null);
    };

    return (
        <Card className={cn(
            "flex flex-col w-full transition-all duration-300",
            data ? "xl:col-span-2 ring-2 ring-mist-500/30" : "h-full"
        )}>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <Search className="w-4 h-4 text-mist-400" />
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 flex-1 flex flex-col">
                <div className="space-y-2">
                    <div className="flex border border-mist-700/30 rounded-md overflow-hidden bg-white text-black shadow-sm focus-within:ring-2 focus-within:ring-mist-500/20 focus-within:border-mist-500 transition-all">
                        <div className="bg-mist-50 px-3 py-2 text-[10px] font-bold font-mono border-r border-mist-700/30 select-none flex items-center text-mist-600 uppercase tracking-tight whitespace-nowrap">
                            {skPrefix || prefix}
                        </div>
                        <Input
                            className="border-0 shadow-none focus-visible:ring-0 rounded-none h-10 px-3 py-2 text-sm flex-1 bg-transparent"
                            placeholder="..."
                            value={id}
                            onChange={(e) => setId(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleDump()}
                        />
                    </div>
                </div>

                <div className="flex gap-2">
                    <Button
                        onClick={handleDump}
                        disabled={loading || !id.trim()}
                        className="flex-1 bg-mist-800 hover:bg-mist-700 text-white font-bold h-9 text-xs"
                    >
                        {loading ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Search className="w-3 h-3 mr-2" />}
                        {t('list.dump.button')}
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={handleClear}
                        disabled={loading || (!id && !data)}
                        className="bg-white border text-mist-800 hover:bg-mist-50 h-9 text-xs px-3"
                    >
                        <Trash2 className="w-3 h-3" />
                    </Button>
                </div>

                {data && (
                    <div className="mt-2 flex-1 flex flex-col min-h-0 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex items-center justify-between mb-1.5 px-1">
                            <p className="text-[10px] font-bold text-mist-500 uppercase">{data.length} records found</p>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 px-1.5 text-[9px] text-mist-400 hover:text-mist-800"
                                onClick={() => setData(null)}
                            >
                                Hide
                            </Button>
                        </div>
                        <pre className="bg-slate-900 p-4 rounded-lg text-[12px] font-mono overflow-auto max-h-[500px] text-emerald-400 border border-slate-800 shadow-inner custom-scrollbar">
                            {JSON.stringify(data, null, 2)}
                        </pre>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

/**
 * ショップ管理者（マネージャー）の紐付けセクション。
 * 複数のユーザーIDと複数ショップIDを指定して一括で紐付け・紐付け解除が可能です 。
 */
function ManagerLinkingSection({ apiUrl }: { apiUrl: string }) {
    const t = useTranslations('AdminPage');
    const [userIdsStr, setUserIdsStr] = useState("");
    const [shopIdsStr, setShopIdsStr] = useState("");
    const [loading, setLoading] = useState(false);
    const [validationData, setValidationData] = useState<{ users: any[], shops: any[] } | null>(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [linkAction, setLinkAction] = useState<"execute" | "unlink">("execute");
    const [resultMessage, setResultMessage] = useState<string | null>(null);

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
                action: linkAction
            });
            const msg = linkAction === 'execute' ? t('list.managerLinking.successLink') : t('list.managerLinking.successUnlink');
            setIsConfirmOpen(false);
            setValidationData(null);
            setResultMessage(msg);
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

                <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-lg w-fit">
                    <Button
                        size="sm"
                        variant={linkAction === 'execute' ? 'default' : 'ghost'}
                        onClick={() => setLinkAction('execute')}
                        className="h-8"
                    >
                        {t('list.managerLinking.actionLink')}
                    </Button>
                    <Button
                        size="sm"
                        variant={linkAction === 'unlink' ? 'default' : 'ghost'}
                        onClick={() => setLinkAction('unlink')}
                        className="h-8"
                    >
                        {t('list.managerLinking.actionUnlink')}
                    </Button>
                </div>

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
                    {loading ? t('list.managerLinking.validating') : (linkAction === 'execute' ? t('list.managerLinking.validateButtonLink') : t('list.managerLinking.validateButtonUnlink'))}
                </Button>

                {/* Confirm Dialog */}
                <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                    <DialogContent className="max-w-2xl text-black">
                        <DialogHeader>
                            <DialogTitle>{linkAction === 'execute' ? t('list.managerLinking.confirmTitleLink') : t('list.managerLinking.confirmTitleUnlink')}</DialogTitle>
                            <DialogDescription>
                                {linkAction === 'execute' ? t('list.managerLinking.confirmMessageLink') : t('list.managerLinking.confirmMessageUnlink')}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                            <div className="space-y-2">
                                <h4 className="font-semibold text-sm border-b pb-1">{t('list.managerLinking.userList')}</h4>
                                <ul className="list-disc list-inside space-y-1 text-sm">
                                    {validationData?.users.map((u: any) => (
                                        <li key={u.id}>
                                            <span className="font-mono text-xs text-gray-400 mr-2">{u.id}</span>
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
                                            <span className="font-mono text-xs text-gray-400 mr-2">{s.id}</span>
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
                            <Button onClick={handleExecute} disabled={loading} variant={linkAction === 'unlink' ? 'destructive' : 'default'}>
                                {loading ? t('list.managerLinking.executing') : (linkAction === 'execute' ? t('list.managerLinking.executeButtonLink') : t('list.managerLinking.executeButtonUnlink'))}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Result Dialog */}
                <Dialog open={!!resultMessage} onOpenChange={(open) => !open && setResultMessage(null)}>
                    <DialogContent className="text-black">
                        <DialogHeader>
                            <DialogTitle>{t('list.managerLinking.resultTitle')}</DialogTitle>
                            <DialogDescription>
                                {resultMessage}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex justify-end">
                            <Button onClick={() => setResultMessage(null)}>
                                {t('list.managerLinking.closeButton')}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </CardContent>
        </Card>
    );
}

/**
 * ショップの所有権（Owner）変更セクション。
 * 既存のオーナーから別のユーザーへショップの管理権限を完全に移譲します。
 */
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

/**
 * 簡易ショップ作成セクション。
 * 指定したユーザーをオーナーとする新規ショップをデフォルト設定で作成します。
 */
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

/**
 * ショップに使用を許可するカードデザインを個別設定するセクション。
 */
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

            // Clean extraction strictly from card_designs field
            const rawLinks = data.card_designs || [];
            const ids = Array.isArray(rawLinks)
                ? rawLinks.map((item: any) => typeof item === 'string' ? item : (item.design_id || item.id || item.SK))
                : [];

            const filteredIds = ids.filter(Boolean);
            // console.log("AdminShopCardDesignLinkSection: extracted IDs", filteredIds);
            setSelectedDesignIds(filteredIds);
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

    // Combine system designs and database designs for full coverage
    const allAvailableDesigns = useMemo(() => {
        const systemDesigns = Object.entries(cardformats).map(([id, data]) => ({
            ...(data as any),
            design_id: id,
            SK: id,
            isSystem: true
        }));

        const combined = [...systemDesigns];
        dbCardDesigns.forEach(dbd => {
            const id = dbd.design_id || dbd.SK;
            if (id && !combined.find(c => c.design_id === id || c.SK === id)) {
                combined.push(dbd);
            }
        });
        return combined;
    }, [dbCardDesigns]);

    return (
        <Card className={cn(
            "flex flex-col w-full transition-all duration-300",
            shopData ? "xl:col-span-2 ring-2 ring-mist-500/30" : "h-full"
        )}>
            <CardHeader>
                <CardTitle>{tLink('title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-gray-500">{tLink('description')}</p>
                <div className="flex flex-col gap-4">
                    <div className="flex-1 space-y-2">
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

                            <div className="flex flex-wrap items-start gap-2">
                                {allAvailableDesigns.map((design) => {
                                    const dId = design.design_id || design.SK || "";
                                    const isSelected = selectedDesignIds.includes(dId);
                                    return (
                                        <div
                                            key={dId}
                                            onClick={() => toggleDesign(dId)}
                                            className={cn(
                                                "relative cursor-pointer rounded-lg border-2 p-1 transition-all group overflow-hidden flex flex-col items-center",
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
                                            {design.isSystem && (
                                                <div className="absolute top-0 left-0 bg-blue-500 text-white px-1.5 py-0.5 text-[7px] font-bold rounded-br shadow-sm z-10">
                                                    SYSTEM
                                                </div>
                                            )}
                                            <div
                                                className="relative rounded overflow-hidden h-24"
                                                style={{ aspectRatio: `${design.width || 84} / ${design.height || 52}` }}
                                            >
                                                <img
                                                    src={design.thumbf || design.bgimgf}
                                                    alt={design.description}
                                                    className="w-full h-full object-fill select-none pointer-events-none"
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
                                            <div className="mt-2 px-1 text-center w-full max-w-[120px]">
                                                <p className="text-[10px] font-medium truncate text-black" title={design.name || dId}>
                                                    {design.name || <span className="opacity-30 italic">{dId}</span>}
                                                </p>
                                                <p className="text-[8px] font-medium truncate text-black" title={design.description || "No Description"}>
                                                    {design.description || <span className="opacity-30 italic">No Description</span>}
                                                </p>
                                                <p className="text-[8px] text-gray-500 font-mono truncate">
                                                    {dId}
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



/**
 * カード注文一覧セクション
 * 印刷所などへの発注ステータス（ORDERED, PRINTING等）を管理し、QRデータの書き出しを行います。
 */
function CardOrderListSection({
    orders,
    loading,
    statusFilter,
    setStatusFilter,
    shopIdFilter,
    setShopIdFilter,
    onUpdateStatus,
    onRefresh,
    onExport,
    isExporting,
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
    onUpdateStatus: (shopId: string, orderId: string, status: string, batchId?: string) => Promise<void>,
    onRefresh: () => void,
    onExport: (order: any, type: 'pdf' | 'csv') => Promise<void>,
    isExporting: string | null,
    dbCardDesigns: any[],
    paperFormat: string,
    cardFormat: string
}) {
    const t = useTranslations('AdminPage');
    const tc = useTranslations('AdminPage.cardOrders');
    const st = useTranslations('Status');
    const ts = useTranslations('Timestamp');
    const [isProcessing, setIsProcessing] = useState<string | null>(null);
    const [selectedOrder, setSelectedOrder] = useState<any>(null);

    const filteredOrders = orders.filter(o =>
        !shopIdFilter || (o.shop_id && o.shop_id.toLowerCase().includes(shopIdFilter.toLowerCase())) || (o.shop_name && o.shop_name.toLowerCase().includes(shopIdFilter.toLowerCase()))
    );

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
                                    <TableHead className="w-[150px]">{tc('table.dateupdated')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center">
                                            <Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400" />
                                        </TableCell>
                                    </TableRow>
                                ) : filteredOrders.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center text-gray-500">
                                            No orders found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredOrders.map((order) => (
                                        <TableRow
                                            key={order.order_id}
                                            className="text-black hover:bg-gray-100 transition-colors cursor-pointer group"
                                            onClick={() => setSelectedOrder(order)}
                                        >
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
                {selectedOrder && (
                    <OrderDetailsDialog
                        order={selectedOrder}
                        isOpen={!!selectedOrder}
                        onClose={() => setSelectedOrder(null)}
                        onUpdateStatus={onUpdateStatus}
                        onExport={onExport}
                        isExporting={isExporting}
                        dbCardDesigns={dbCardDesigns}
                        paperFormat={paperFormat}
                    />
                )}
            </CardContent>
        </Card>
    );
}

/**
 * 個別のバッチ（印刷セット）を表示するコンポーネント。
 * セッション履歴とデータベース履歴の両方で使用されます。
 */
function BatchItem({
    batch,
    t,
    handleCopy,
    copiedId,
    setIsExportingCsv,
    isExportingCsv,
    cardFormat,
    dbCardDesigns,
    handleGeneratePDF,
    paperFormat
}: any) {
    const resolveDesign = (designId?: string) => {
        const targetId = designId || cardFormat;
        const dbDesign = dbCardDesigns.find((d: any) => d.design_id === targetId);
        if (dbDesign) return dbDesign;
        if (cardformats[targetId]) return targetId;
        return targetId;
    };

    return (
        <div key={batch.id} className="bg-white border border-gray-200 p-4 rounded-lg text-black shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center mb-3 flex-wrap gap-4">
                <div className="flex gap-2 flex-wrap items-center">
                    <div>
                        <div className="flex items-center gap-1">
                            <p className="font-bold text-mist-900">{t('batches.batchId', { id: batch.id })}</p>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 text-mist-400 hover:text-mist-600"
                                onClick={() => handleCopy(batch.id)}
                            >
                                {copiedId === batch.id ? (
                                    <Check className="h-3 w-3 text-green-500" />
                                ) : (
                                    <Copy className="h-3 w-3" />
                                )}
                            </Button>
                        </div>
                        <p className="text-xs text-gray-500 flex items-center gap-2 mt-1">
                            <Calendar className="w-3 h-3" />
                            {t('batches.info', { count: batch.count, date: new Date(batch.date).toLocaleString() })}
                        </p>
                        {batch.order_id && (
                            <p className="text-[10px] text-mist-500 mt-1 font-medium bg-mist-50 px-1.5 py-0.5 rounded border border-mist-100 inline-block">
                                Order: {batch.order_id}
                            </p>
                        )}
                    </div>
                    <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200">
                        {t(`batches.status.${batch.status}`)}
                    </Badge>
                </div>
                <div className="ml-auto flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs border-mist-200 hover:bg-mist-50"
                        onClick={async () => {
                            setIsExportingCsv(batch.id);
                            try {
                                let targetDesignId = batch.design_id;
                                if (!targetDesignId && batch.order_id) {
                                    try {
                                        const order = await adminApi.admin_card_orders_get({ order_id: batch.order_id });
                                        if (order && order.design_id) {
                                            targetDesignId = order.design_id;
                                        }
                                    } catch (e) {
                                        console.error("Failed to fetch order details for design_id", e);
                                    }
                                }
                                const design = resolveDesign(targetDesignId);
                                await handleGeneratePDF(batch, paperFormat, design);
                            } finally {
                                setIsExportingCsv(null);
                            }
                        }}
                    >
                        {isExportingCsv === batch.id ? (
                            <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        ) : (
                            <FileText className="w-3.5 h-3.5 mr-1.5 text-mist-600" />
                        )}
                        {t('batches.downloadPdf')}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={isExportingCsv === batch.id}
                        className="h-8 text-xs border-mist-200 hover:bg-mist-50"
                        onClick={async () => {
                            setIsExportingCsv(batch.id);
                            try {
                                let targetDesignId = batch.design_id;
                                if (!targetDesignId && batch.order_id) {
                                    try {
                                        const order = await adminApi.admin_card_orders_get({ order_id: batch.order_id });
                                        if (order && order.design_id) {
                                            targetDesignId = order.design_id;
                                        }
                                    } catch (e) {
                                        console.error("Failed to fetch order details for design_id", e);
                                    }
                                }
                                const design = resolveDesign(targetDesignId);
                                await generateCSVExport(batch, design);
                            } finally {
                                setIsExportingCsv(null);
                            }
                        }}
                    >
                        {isExportingCsv === batch.id ? (
                            <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        ) : (
                            <Download className="w-3.5 h-3.5 mr-1.5 text-mist-600" />
                        )}
                        {t('batches.downloadCsv')}
                    </Button>
                </div>
            </div>

            {/* Display Codes (Collapsible or Scrollable) */}
            <div className="mt-2 bg-gray-50 border border-gray-100 p-2 rounded-md text-[10px] font-mono overflow-auto max-h-32">
                <table className="w-full text-left">
                    <thead className="text-gray-400 border-b border-gray-100">
                        <tr>
                            <th className="pb-1 font-normal">{t('batches.table.qrId')}</th>
                            <th className="pb-1 font-normal">{t('batches.table.pin')}</th>
                        </tr>
                    </thead>
                    <tbody className="text-mist-800">
                        {batch.codes?.map((code: any) => (
                            <tr key={code.qr_id} className="border-b border-gray-50 last:border-0 group hover:bg-white transition-colors">
                                <td className="pr-4 py-1 select-all break-all">
                                    <div className="flex items-center gap-1">
                                        {code.qr_id}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={() => handleCopy(code.qr_id)}
                                        >
                                            {copiedId === code.qr_id ? (
                                                <Check className="h-2 w-2 text-green-500" />
                                            ) : (
                                                <Copy className="h-2 w-2" />
                                            )}
                                        </Button>
                                    </div>
                                </td>
                                <td className="py-1 select-all break-all">
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
    );
}
