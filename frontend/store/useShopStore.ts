import { create } from 'zustand';

export interface ScannedId {
    qr_id: string;
    ts: number;
    status?: {
        status: string;
        product_linked: boolean;
        product_name?: string;
    };
    error?: string;
}

// --- Initial States ---

const initialListState = {
    isDetailFiltering: false,
    orderStatusFilter: 'ALL',
    orderProductFilter: null as string | null,
    searchQrId: '',
    isColumnSettingsOpen: false,
    orderSortConfig: null as { key: string, direction: 'asc' | 'desc' } | null,
    visibleOrderColumns: ['id', 'status', 'ts_updated_at', 'ts_created_at', 'product_id'],
    shippingOrderId: null as string | null,
    copiedId: null as string | null,
    subRefreshing: false,
};

const initialOrderCardState = {
    selectedOrderProduct: null as any | null,
    orderQuantity: 100,
    isCreatingCardOrder: false,
    isConfirmOrderDialogOpen: false
};

const initialActivationState = {
    isLinking: false,
    isScanning: false,
    scannedQrId: '',
    showOptions: false,
    isContinuousScan: false,
    scannedQrIds: [] as ScannedId[],
    isManualInput: false,
    manualInput: '',
    copiedId: null as string | null,
};

const initialSettingsState = {
    isSettingsOpen: false,
    isSettingShowHTML: false,
    isSettingUploading: false,
    debouncedPreviewHtml: '',
    htmlImageUrls: [] as string[],
    htmlImageUrlsToDelete: [] as string[],
    isHtmlImageSectionOpen: false,
    isUploadingHtmlImage: false,
    sessionUploadedUrls: [] as string[],
    adminEmails: null as { owner_email: string, manager_emails: string[] } | null,
};

// --- Derived Types ---

export type CardListUIState = typeof initialListState;
export type OrderCardUIState = typeof initialOrderCardState;
export type CardActivationUIState = typeof initialActivationState;
export type ShopSettingsUIState = typeof initialSettingsState;

export interface ShopUISections {
    list: CardListUIState;
    orderCard: OrderCardUIState;
    activation: CardActivationUIState;
    settings: ShopSettingsUIState;
}

export type Patch<T> = Partial<T> | ((prev: T) => Partial<T>);

interface ShopStore extends ShopUISections {
    update: <K extends keyof ShopUISections>(
        section: K,
        patch: Patch<ShopUISections[K]>
    ) => void;
    resetList: () => void;
}

// --- Store ---

export const useShopStore = create<ShopStore>((set) => ({
    list: initialListState,
    orderCard: initialOrderCardState,
    activation: initialActivationState,
    settings: initialSettingsState,

    update: (section, patch) => set((state) => ({
        [section]: {
            ...state[section],
            ...(typeof patch === 'function' ? (patch as any)(state[section]) : patch)
        }
    })),

    resetList: () => set({ list: initialListState })
}));

// --- Section hooks for ergonomic usage in components ---

export const useCardListUI = () => {
    const state = useShopStore(s => s.list);
    const update = useShopStore(s => s.update);
    return { ...state, set: (patch: Patch<CardListUIState>) => update('list', patch) };
};

export const useOrderCardUI = () => {
    const state = useShopStore(s => s.orderCard);
    const update = useShopStore(s => s.update);
    return { ...state, set: (patch: Patch<OrderCardUIState>) => update('orderCard', patch) };
};

export const useActivationUI = () => {
    const state = useShopStore(s => s.activation);
    const update = useShopStore(s => s.update);
    return { ...state, set: (patch: Patch<CardActivationUIState>) => update('activation', patch) };
};

export const useSettingsUI = () => {
    const state = useShopStore(s => s.settings);
    const update = useShopStore(s => s.update);
    return { ...state, set: (patch: Patch<ShopSettingsUIState>) => update('settings', patch) };
};
