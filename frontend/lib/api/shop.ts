import { fetchAuthSession } from 'aws-amplify/auth';

const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";

/**
 * ショップ管理用 API クライアント
 * ショップオーナー/マネージャー機能を一箇所に集約し、安全なトークン管理と一貫したヘッダー設定を提供します。
 */
export const shopApiBase = {
    /**
     * 基本となる fetch ラッパー
     */
    async fetch(path: string, options: RequestInit = {}) {
        const session = await fetchAuthSession();
        const token = session.tokens?.idToken?.toString();

        if (!token) {
            throw new Error("No authorization token found");
        }

        const headers = {
            ...options.headers,
            "Authorization": `Bearer ${token}`,
            "Content-Type": options.body ? "application/json" : (options.headers as any)?.["Content-Type"] || undefined,
        };

        const res = await fetch(`${NEXT_PUBLIC_API_URL}${path.startsWith('/') ? '' : '/'}${path}`, {
            ...options,
            headers,
        });

        if (!res.ok) {
            // API Gateway 401/403 -> 404 偽装への対応
            // if (res.status === 404) {
            //     throw { status: 404, message: "fetch error" + " error: " + res?.statusText };
            // }
            const error = await res.json().catch(() => ({ message: res.statusText }));
            throw { status: res.status, ...error };
        }

        return res.json();
    },

    async fetch_post(path: string, data: any) {
        return this.fetch(path, { method: "POST", body: JSON.stringify(data) });
    },
};

// プロキシベースの API クライアント生成
function createShopApi<T extends Record<string, any>>(base: typeof shopApiBase) {
    return new Proxy(base, {
        get(target, prop: string) {
            if (prop in target) return (target as any)[prop];
            // shop_list -> /shop/list, shop_products_import -> /shop/products/import
            const path = "/" + (prop as string).replace(/_/g, "/");
            return (data: any) => (target as any).fetch_post(path, data);
        }
    }) as typeof shopApiBase & { [K in keyof T]: (data: T[K]) => Promise<any> }
}

// 外部公開用のインスタンス
export const shopApi = createShopApi<ShopApiSchema>(shopApiBase);

////////////////////////////////////////////////////////////////////////////////////////
// lambda関数を変更したら以下の型定義を更新してください
////////////////////////////////////////////////////////////////////////////////////////
/**
 * ショップ用 API の型定義
 * キー名がそのまま API パス（/shop/キー名）として使用されます。
 * _ は / に置換されます
 */
type ShopApiSchema = {
    shop_list: {};
    shop_details_get: { shopId: string };
    shop_details_update: { shopId: string; name?: string; description?: string; detail_html?: string; html_image_urls?: string[]; deleted_html_image_urls?: string[] };
    shop_admins: { shopId: string };
    shop_delete_images: { shopId: string; keys?: string[]; urls?: string[] };
    shop_orders_list: { shopId: string; uuid?: string };
    shop_orders_update: { shopId: string; qr_id: string; status?: string; delivery_company?: string; tracking_number?: string; memo_for_users?: string; memo_for_shop?: string };
    shop_products_list: { shopId: string };
    shop_products_create: { shopId: string; name: string; description?: string; image_url?: string; price?: number; valid_days?: number; detail_html?: string; card_design_id: string };
    shop_products_update: { shopId: string; product_id: string; status?: "ACTIVE" | "STOPPED"; name?: string; description?: string; image_url?: string; price?: number; valid_days?: number; detail_html?: string; card_design_id?: string };
    shop_products_delete: { shopId: string; product_id: string };
    shop_products_import_list: { shopId: string };
    shop_products_import_execute: { shopId: string; importShopId: string };
    shop_products_uploadurl: { shopId: string; filename: string; contentType: string; folder?: string };
    shop_qr_list: { shopId: string };
    shop_qr_link: { shopId: string; qr_id: string; product_id: string; activate_now?: boolean; memo_for_users?: string; memo_for_shop?: string };
    shop_qr_activate: { shopId: string; qr_id: string };
    shop_qrcodecheck: { shopId: string; qr_id: string };
    shop_card_orders_create: { shopId: string; quantity: number; design_id: string; product_id?: string; shop_user_id?: string; sender_user_id?: string; expiration_date?: string; activate_now?: boolean };
    shop_card_orders_list: { shopId: string };
    shop_card_orders_cancel: { shopId: string; order_id: string };
    shop_card_orders_complete: { shopId: string; order_id: string };
};
