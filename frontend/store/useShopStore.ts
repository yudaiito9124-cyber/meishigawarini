/**
 * ファイル概要: ショップ管理 UI 状態管理ストア (Shop Management UI State Store)
 * 
 * 役割:
 * ショップ管理画面における各セクション（注文一覧、カード発注、アクティベーション、設定）
 * の表示状態、フィルター設定、ローカルな入力バッファなどを一括管理します。
 * 汎用的な状態管理ライブラリ `Zustand` を使用しています。
 * 
 * 主要機能:
 * 1. セクションごとの状態の独立管理 (`list`, `orderCard`, `activation`, `settings`)。
 * 2. 汎用的な `update` メソッドによる、型の安全な部分更新。
 * 3. コンポーネントから使いやすいエルゴノミックなカスタムフック (`useCardListUI` 等) の提供。
 */

import { create } from 'zustand';

/** スキャンされた QR コードの基本情報インターフェース */
export interface ScannedId {
    qr_id: string; // QRコードUUID
    ts: number;    // スキャン時のタイムスタンプ
    status?: {
        status: string;           // カードステータス
        product_linked: boolean;  // 商品との紐付け有無
        product_name?: string;    // 紐付いている商品名
        product_id?: string;      // 紐付いている商品ID
    };
    error?: string; // スキャン時/照会時のエラー
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── 初期状態定義 (Initial States) ──────────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** カード一覧セクションの初期状態 */
const initialListState = {
    isDetailFiltering: false,       // 詳細フィルタリングパネルの開閉
    orderStatusFilter: [] as string[],       // ステータスの複数選択フィルター（空配列 = ALL）
    orderProductFilter: [] as string[],      // 商品の複数選択フィルター（空配列 = ALL）
    orderUpdatedFilter: 'ALL',      // 更新日フィルター
    orderExpirationFilter: 'ALL',   // 有効期限フィルター
    orderSubmissionFilter: 'ALL',   // 住所提出状況フィルター
    orderPreferredDateFilter: 'ALL',// 配送希望日フィルター
    searchQrId: '',                 // QR ID 検索文字列
    isColumnSettingsOpen: false,    // カラム表示設定ダイアログの開閉
    orderSortConfig: null as { key: string, direction: 'asc' | 'desc' } | null, // ソート設定
    visibleOrderColumns: ['id', 'status', 'ts_updated_at', 'ts_created_at', 'product_id'], // 表示カラム
    shippingOrderId: null as string | null, // 配送処理中の注文ID
    copiedId: null as string | null, // クリップボードにコピーされた最新のID
    subRefreshing: false,           // 一覧の再取得中フラグ
};

/** カード発注セクションの初期状態 */
const initialOrderCardState = {
    selectedOrderProduct: null as any | null, // 注文対象の商品
    orderQuantity: 100,                     // 注文数量
    isCreatingCardOrder: false,             // 発注リクエスト送信中
    isConfirmOrderDialogOpen: false        // 発注確認ダイアログの開閉
};

/** アクティベーション（紐付け）セクションの初期状態 */
const initialActivationState = {
    isLinking: false,             // 紐付け処理実行中
    isScanning: false,            // カメラによるスキャン中
    scannedQrId: '',              // 最後に見つかった QR ID
    showOptions: false,           // スキャン後オプションの表示
    isContinuousScan: false,      // 連続スキャンモードの有効化
    scannedQrIds: [] as ScannedId[], // スキャン済みリスト
    isManualInput: false,         // 手動入力モードの開閉
    manualInput: '',              // 手動入力バッファ
    copiedId: null as string | null,
};

/** ショップ設定セクションの初期状態 */
const initialSettingsState = {
    isSettingsOpen: false,        // 設定パネルの開閉
    isSettingShowHTML: false,     // HTML プレビューの表示切替
    isSettingUploading: false,    // 全体的なアップロード中状態
    debouncedPreviewHtml: '',     // プレビュー用の HTML 文字列 (debounce済み)
    htmlImageUrls: [] as string[], // 現在の HTML 内画像 URL
    htmlImageUrlsToDelete: [] as string[], // 削除待ち画像 URL
    isHtmlImageSectionOpen: false, // 画像管理セクションの開閉
    isUploadingHtmlImage: false,   // 画像アップロード中
    sessionUploadedUrls: [] as string[], // このセッションでアップロードされた URL
    adminEmails: null as { owner_email: string, manager_emails: string[] } | null, // 通知先メールアドレス
    copiedId: null as string | null,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── 型定義 ──────────────────────────────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type CardListUIState = typeof initialListState;
export type OrderCardUIState = typeof initialOrderCardState;
export type CardActivationUIState = typeof initialActivationState;
export type ShopSettingsUIState = typeof initialSettingsState;

/** ストア全体のセクション構造 */
export interface ShopUISections {
    list: CardListUIState;
    orderCard: OrderCardUIState;
    activation: CardActivationUIState;
    settings: ShopSettingsUIState;
}

/** 状態更新用のパッチ型 (部分更新オブジェクトまたは関数) */
export type Patch<T> = Partial<T> | ((prev: T) => Partial<T>);

/** ストアのインターフェース */
interface ShopStore extends ShopUISections {
    /** 指定したセクションの状態を更新します */
    update: <K extends keyof ShopUISections>(
        section: K,
        patch: Patch<ShopUISections[K]>
    ) => void;
    /** 一覧状態を初期化します */
    resetList: () => void;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── ストア実体 (Zustand Store) ────────────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ショップ管理画面用グローバル UI ストア
 */
export const useShopStore = create<ShopStore>((set) => ({
    list: initialListState,
    orderCard: initialOrderCardState,
    activation: initialActivationState,
    settings: initialSettingsState,

    /**
     * 特定のセクションを部分更新する汎用的なアクション
     */
    update: (section, patch) => set((state) => ({
        [section]: {
            ...state[section],
            ...(typeof patch === 'function' ? (patch as any)(state[section]) : patch)
        }
    })),

    /** 検索条件などをリセットする場合に使用 */
    resetList: () => set({ list: initialListState })
}));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── セクション別カスタムフック ──────────────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** カード一覧 UI 用フック */
export const useCardListUI = () => {
    const state = useShopStore(s => s.list);
    const update = useShopStore(s => s.update);
    return { ...state, set: (patch: Patch<CardListUIState>) => update('list', patch) };
};

/** カード発注 UI 用フック */
export const useOrderCardUI = () => {
    const state = useShopStore(s => s.orderCard);
    const update = useShopStore(s => s.update);
    return { ...state, set: (patch: Patch<OrderCardUIState>) => update('orderCard', patch) };
};

/** アクティベーション UI 用フック */
export const useActivationUI = () => {
    const state = useShopStore(s => s.activation);
    const update = useShopStore(s => s.update);
    return { ...state, set: (patch: Patch<CardActivationUIState>) => update('activation', patch) };
};

/** ショップ設定 UI 用フック */
export const useSettingsUI = () => {
    const state = useShopStore(s => s.settings);
    const update = useShopStore(s => s.update);
    return { ...state, set: (patch: Patch<ShopSettingsUIState>) => update('settings', patch) };
};

