/**
 * ファイル概要: ショップ管理用 API クライアント (Shop API Client)
 * 
 * 役割:
 * ショップのオーナーやマネージャーが使用するバックエンド API との通信を管理します。
 * ショップ情報、商品情報、注文履歴、デザイン設定などの操作に使用されます。
 * 
 * 主要機能:
 * 1. 認証トークンの自動取得と Authorization ヘッダーへの付与。
 * 2. プロキシ (`Proxy`) を利用した、エンドポイントの動的解決。
 * 3. 統一されたエラーハンドリング（Amplify IDトークンベース）。
 */

import { fetchAuthSession } from 'aws-amplify/auth';
import { ShopApiSchema } from '@shared/api-types';

/** API のベース URL */
const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── ベースAPI定義 ──────────────────────────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ショップ管理用 API クライアントの基底実装
 * ショップオーナー/マネージャー機能を一箇所に集約し、安全なトークン管理と一貫したヘッダー設定を提供します。
 */
export const shopApiBase = {
    /**
     * 基本となる fetch ラッパー
     * 
     * @param path APIエンドポイントのパス (例: "/shop/products/list")
     * @param options Fetch オプション
     * @returns API レスポンスの JSON
     * @throws 認証エラーまたは API エラー
     */
    async fetch(path: string, options: RequestInit = {}) {
        // 現在の Amplify セッションから ID トークンを取得
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

    /**
     * POST リクエストのラッパー
     */
    async fetch_post(path: string, data: any) {
        return this.fetch(path, { method: "POST", body: JSON.stringify(data) });
    },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── プロキシ生成ロジック ────────────────────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * プロキシベースの API クライアント生成
 * スネークケースのプロパティ名をスラッシュ区切りのパスに変換します。
 * shop_products_list -> /shop/products/list
 */
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

/** 外部公開用のインスタンス */
export const shopApi = createShopApi<ShopApiSchema>(shopApiBase);

