import { fetchAuthSession } from 'aws-amplify/auth';
import { ReceiveApiSchema } from '@shared/api-types';

const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";

/**
 * 受取人 (Receive) 用 API クライアント
 * QRコードのUUIDとPINを使用した独自の認証方式を採用しています。
 */
export const receiveApiBase = {
    /**
     * 基本となる fetch ラッパー
     */
    async fetch(path: string, qr_id: string, pin: string, options: RequestInit = {}) {
        const idToken = await fetchAuthSession()
            .then(session => session.tokens?.idToken?.toString())
            .catch(() => undefined);

        const headers = {
            ...options.headers,
            ...(idToken && { "authorization": `Bearer ${idToken}` }),
            "x-qr-id": qr_id,
            "x-qr-pin": pin,
            "content-type": options.body ? "application/json" : (options.headers as any)?.["content-type"] || undefined,
        };

        const res = await fetch(`${NEXT_PUBLIC_API_URL}${path.startsWith('/') ? '' : '/'}${path}`, {
            ...options,
            headers,
        });

        if (!res.ok) {
            // API Gateway 401/403 -> 404 偽装への対応
            if (res.status === 404) {
                throw { status: 404, message: "QRコードが無効か、PINが正しくありません。" };
            }
            const error = await res.json().catch(() => ({ message: res.statusText }));
            throw { status: res.status, ...error };
        }

        return res.json();
    },

    async fetch_post(path: string, qr_id: string, pin: string, data: any) {
        return this.fetch(path, qr_id, pin, { method: "POST", body: JSON.stringify(data) });
    },

    /** 
     * PIN検証 (初回アクセス時のみ Authorizer を通さずに実行可能)
     */
    async verify(qr_id: string, pin: string, password?: string) {
        const res = await fetch(`${NEXT_PUBLIC_API_URL}/receive/verify`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ qr_id, pin, password })
        });
        if (!res.ok) throw await res.json().catch(() => ({ message: res.statusText }));
        return res.json();
    },

    /** 
     * Share用公開情報の取得 (GET /share/{qr_id})
     */
    async share_get(qr_id: string) {
        const res = await fetch(`${NEXT_PUBLIC_API_URL}/share/${qr_id}`);
        if (!res.ok) throw await res.json().catch(() => ({ message: res.statusText }));
        return res.json();
    }
};

// プロキシベースの API クライアント生成
function createReceiveApi<T extends Record<string, any>>(base: typeof receiveApiBase) {
    return new Proxy(base, {
        get(target, prop: string) {
            if (prop in target) return (target as any)[prop];
            // receive_chat -> /receive/chat
            const path = "/" + (prop as string).replace(/_/g, "/");
            return (qr_id: string, pin: string, data: any) => (target as any).fetch_post(path, qr_id, pin, data);
        }
    }) as typeof receiveApiBase & { [K in keyof T]: (qr_id: string, pin: string, data: T[K]) => Promise<any> }
}

// 外部公開用のインスタンス
export const receiveApi = createReceiveApi<ReceiveApiSchema>(receiveApiBase);
