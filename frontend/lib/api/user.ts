/**
 * ファイル概要: ユーザープロフィール管理用 API クライアント (User API Client)
 * 
 * 役割:
 * 一般ユーザー（ギフトの購入者や受取人など、Cognito ユーザープールに登録されているユーザー）
 * が自身のプロフィール情報、注文履歴、受け取り履歴などを操作するための通信を管理します。
 * 
 * 主要機能:
 * 1. ユーザー自身の認証トークンを取得し、リクエストに付随させる。
 * 2. プロキシ (`Proxy`) を利用した、エンドポイントの動的解決。
 * 3. ユーザー情報の取得・更新に関する統一されたインターフェースの提供。
 */

import { fetchAuthSession } from 'aws-amplify/auth';
import { UserApiSchema } from '@shared/api-types';

/** API のベース URL */
const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── ベースAPI定義 ──────────────────────────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ユーザープロフィール管理用 API クライアントの基底実装
 * ユーザー自身の情報の取得・更新を安全に行うための Cognito 認証トークン管理を含みます。
 */
export const userApiBase = {
    /**
     * 基本となる fetch ラッパー (Cognito 認証)
     * 
     * @param path APIエンドポイントのパス (例: "/user/profile")
     * @param options Fetch オプション
     * @returns API レスポンスの JSON
     */
    async fetch(path: string, options: RequestInit = {}) {
        // Amplify セッションから ID トークンを取得
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
 * user_history_get -> /user/history/get
 */
function createUserApi<T extends Record<string, any>>(base: typeof userApiBase) {
    return new Proxy(base, {
        get(target, prop: string) {
            if (prop in target) return (target as any)[prop];
            // user_profile_get -> /user/profile/get
            const path = "/" + (prop as string).replace(/_/g, "/");
            return (data: any) => (target as any).fetch_post(path, data);
        }
    }) as typeof userApiBase & { [K in keyof T]: (data: T[K]) => Promise<any> }
}

/** 外部公開用のインスタンス */
export const userApi = createUserApi<UserApiSchema>(userApiBase);

