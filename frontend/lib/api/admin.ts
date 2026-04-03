import { fetchAuthSession } from 'aws-amplify/auth';
import { AdminApiSchema } from '@shared/api-types';

const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";

/**
 * 管理者用 API クライアント
 * 管理者機能を一箇所に集約し、安全なトークン管理と一貫したヘッダー設定を提供します。
 */
export const adminApiBase = {
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

    /** 権限確認 */
    async check() {
        return this.fetch("/admin");
    },
};

// プロキシベースの API クライアント生成
function createAdminApi<T extends Record<string, any>>(base: typeof adminApiBase) {
    return new Proxy(base, {
        get(target, prop: string) {
            if (prop in target) return (target as any)[prop];
            const path = "/" + (prop as string).replace(/_/g, "/");
            return (data: any) => (target as any).fetch_post(path, data);
        }
    }) as typeof adminApiBase & { [K in keyof T]: (data: T[K]) => Promise<any> }
}

// 外部公開用のインスタンス
export const adminApi = createAdminApi<AdminApiSchema>(adminApiBase);

// {@link /documents/ADMIN_API_REFERENCE.md}