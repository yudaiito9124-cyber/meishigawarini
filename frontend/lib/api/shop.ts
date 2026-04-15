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
 * 4. 読み取り系リクエスト（/list, /get）の in-flight 重複排除。
 *    同一キー（method:path:body）のリクエストが並列実行された場合、
 *    最初の 1 本の Promise を共有して不要な多重リクエストを防ぐ。
 * 5. 読み取り系リクエストの自動リトライ（最大 3 回、150ms×試行回数のバックオフ）。
 *    React StrictMode の二重実行や初期ロード時の並列バースト起因の
 *    一時的な 5xx エラーに対して透過的に回復する。
 */

/**
 * リトライ対象の HTTP ステータスコードセット。
 * 5xx 系のうちサーバー側の一時的な障害を示すコードを対象とする。
 */

import { fetchAuthSession } from 'aws-amplify/auth';
import { ShopApiSchema } from '@shared/api-types';

/** API のベース URL */
const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";

const RETRYABLE_STATUS_CODES = new Set([500, 502, 503, 504]);

/**
 * 現在 in-flight 中の読み取り系リクエストを保持するマップ。
 * キー: `method:path:body` 文字列 / 値: 実行中の Promise
 * リクエスト完了後（成功・失敗問わず）に finally で削除される。
 */
const pendingReadRequests = new Map<string, Promise<any>>();

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * リクエストが「読み取り系」かどうかを判定する。
 * POST で、かつパスが /list または /get で終わるものが対象。
 * これらは副作用がないため、重複排除・リトライを安全に適用できる。
 */
function isReadLikeRequest(path: string, options: RequestInit): boolean {
    const method = (options.method || 'GET').toUpperCase();
    if (method !== 'POST') return false;
    return /\/(list|get)$/.test(path);
}

/**
 * エラーがリトライ可能かどうかを判定する。
 * - `TypeError`: ネットワーク到達不能（DNS 解決失敗、接続拒否など）
 * - RETRYABLE_STATUS_CODES に含まれる HTTP ステータス: サーバー側の一時障害
 */
function isRetryableError(error: any): boolean {
    if (error instanceof TypeError) return true;
    const status = typeof error?.status === 'number' ? error.status : undefined;
    return status !== undefined && RETRYABLE_STATUS_CODES.has(status);
}

/**
 * in-flight 重複排除に使用するリクエストキーを生成する。
 * 同じメソッド・パス・ボディのリクエストは同一の Promise を共有する。
 */
function buildRequestKey(path: string, options: RequestInit): string {
    const method = (options.method || 'GET').toUpperCase();
    const body = typeof options.body === 'string' ? options.body : '';
    return `${method}:${path}:${body}`;
}

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
        const requestKey = buildRequestKey(path, options);
        const readLike = isReadLikeRequest(path, options);

        if (readLike) {
            const pending = pendingReadRequests.get(requestKey);
            if (pending) return pending;
        }

        const run = async () => {
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

            const maxAttempts = readLike ? 3 : 1;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    const res = await fetch(`${NEXT_PUBLIC_API_URL}${path.startsWith('/') ? '' : '/'}${path}`, {
                        ...options,
                        headers,
                    });

                    if (!res.ok) {
                        const error = await res.json().catch(() => ({ message: res.statusText }));
                        throw { status: res.status, ...error };
                    }

                    return res.json();
                } catch (error: any) {
                    const canRetry = readLike && attempt < maxAttempts && isRetryableError(error);
                    if (!canRetry) throw error;
                    await sleep(150 * attempt);
                }
            }
        };

        const promise = run().finally(() => {
            if (readLike) pendingReadRequests.delete(requestKey);
        });

        if (readLike) pendingReadRequests.set(requestKey, promise);
        return promise;
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

