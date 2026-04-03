import { fetchAuthSession } from 'aws-amplify/auth';
import { ShopApiSchema } from '@shared/api-types';

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
            "authorization": `Bearer ${token}`,
            "content-type": options.body ? "application/json" : (options.headers as any)?.["content-type"] || undefined,
        };

        const res = await fetch(`${NEXT_PUBLIC_API_URL}${path.startsWith('/') ? '' : '/'}${path}`, {
            ...options,
            headers,
        });

        if (!res.ok) {
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
