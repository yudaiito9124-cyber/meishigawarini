import { fetchAuthSession } from 'aws-amplify/auth';

const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";

/**
 * ユーザープロフィール管理用 API クライアント
 * ユーザー自身の情報の取得・更新を安全に行うための Cognito 認証トークン管理を含みます。
 */
export const userApiBase = {
    /**
     * 基本となる fetch ラッパー (Cognito 認証)
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

// 外部公開用のインスタンス
export const userApi = createUserApi<UserApiSchema>(userApiBase);

/**
 * ユーザー用 API の型定義
 */
type UserApiSchema = {
    user_profile_get: {};
    user_profile_update: { profile: any; deleted_html_image_urls?: string[] };
    user_profile_uploadurl: { filename: string; contentType: string };
    user_receiver_get: {};
    user_receiver_update: { receiver_info: any };
    user_history_get: {};
    user_history_sendgift: { uuid: string; pin: string };
};

