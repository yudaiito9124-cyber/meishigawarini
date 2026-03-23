const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";

/**
 * 受取人 (Receive) 用 API クライアント
 * QRコードのUUIDとPINを使用した独自の認証方式を採用しています。
 */
export const receiveApiBase = {
    /**
     * 基本となる fetch ラッパー
     */
    async fetch(path: string, uuid: string, pin: string, options: RequestInit = {}) {
        const headers = {
            ...options.headers,
            "X-QR-UUID": uuid,
            "X-QR-PIN": pin,
            "Content-Type": options.body ? "application/json" : (options.headers as any)?.["Content-Type"] || undefined,
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

    async fetch_post(path: string, uuid: string, pin: string, data: any) {
        return this.fetch(path, uuid, pin, { method: "POST", body: JSON.stringify(data) });
    },

    /** 
     * PIN検証 (初回アクセス時のみ Authorizer を通さずに実行可能)
     */
    async verify(uuid: string, pin: string, password?: string) {
        const res = await fetch(`${NEXT_PUBLIC_API_URL}/receive/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uuid, pin, password })
        });
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
            return (uuid: string, pin: string, data: any) => (target as any).fetch_post(path, uuid, pin, data);
        }
    }) as typeof receiveApiBase & { [K in keyof T]: (uuid: string, pin: string, data: T[K]) => Promise<any> }
}

// 外部公開用のインスタンス
export const receiveApi = createReceiveApi<ReceiveApiSchema>(receiveApiBase);

////////////////////////////////////////////////////////////////////////////////////////
// lambda関数を変更したら以下の型定義を更新してください
////////////////////////////////////////////////////////////////////////////////////////
/**
 * 受取人用 API の型定義
 * キー名がそのまま API パス（/receive/キー名）として使用されます。
 * _ は / に置換されます
 */
type ReceiveApiSchema = {
    receive_submit: {
        qr_id: string;
        pin_code: string;
        shipping_info: {
            name: string;
            zipCode: string;
            address: string;
            phone?: string;
            email?: string;
            preferredDate?: string;
            preferredTime?: string;
            client_timestamp?: string
        };
        password?: string
    };
    receive_completed: { qr_id: string; pin_code: string };
    receive_chat_get: {};
    receive_chat_send: { username: string; message?: string; file_url?: string; file_name?: string; file_size?: number; file_type?: string };
    receive_subscription: { email: string; locale: string };
    receive_sender_update: { sender_info: any; deleted_html_image_urls?: string[]; locale?: string };
    receive_sender_load: { id: string };
    receive_sender_save: { sender_info: any; id?: string };
    receive_uploadurl_get: { filename: string; contentType: string; fileSize: number; folder?: string };
};
