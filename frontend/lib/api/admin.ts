import { fetchAuthSession } from 'aws-amplify/auth';

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



////////////////////////////////////////////////////////////////////////////////////////
// lambda関数を変更したら以下の型定義を更新してください
////////////////////////////////////////////////////////////////////////////////////////
/**
 * 管理者用 API の型定義
 * キー名がそのまま API パス（/admin/キー名）として使用されます。
 * _ は / に置換されます
 */
type AdminApiSchema = {
    // 管理
    admin_dump: { pks: string[] }; //PKでレコードを取得
    admin_links: { shopIds: string[]; userIds: string[]; action: "validate" | "execute" }; //ショップと別の管理者をリンク
    admin_changeowner: { shopId: string, newUserId: string, action: "validate" | "execute" }; // ショップのオーナー変更
    admin_shop_create: { name: string; description?: string; owner_id?: string; gm_ids?: string[] }; // ショップの作成
    admin_shop_carddesign_link_get: { shopId: string }; // ショップとカードデザインの紐付け取得
    admin_shop_carddesign_link_update: { shopId: string; card_designs: string[] }; // ショップとカードデザインの紐付け更新
    // QRコード
    admin_qr_ban: { uuid: string; reason?: string }; //QRコードをBAN / 解除
    admin_qr_deleteban: { target?: string }; //BANされたQRコードを削除 (指定がない場合は全件)
    admin_qr_generate: {
        count: number;
        shopId?: string;
        productId?: string;
        expiry_date?: string;
        owner_uuid?: string;
        sender_info?: { [key: string]: any };
        senderId?: string;
        activate_now?: boolean;
        card_design: string
    }; //QRコードを生成
    admin_qr_list: { status: string, keyword?: string, limit?: number }; //QRコードのリストを取得 (limit: 取得件数制限)
    // カードデザイン
    admin_carddesigns_list: {}; //カードデザインのリストを取得
    admin_carddesigns_create: { design_id: string; design: { [key: string]: any } }; //カードデザインを作成
    admin_carddesigns_update: { design_id: string; design: { [key: string]: any } }; //カードデザインを更新
    admin_carddesigns_delete: { design_id: string }; //カードデザインを削除
    admin_carddesigns_uploadurl: { filename: string; contentType: string; design_id: string }; //カードデザインのアップロードURLを取得
};



// {@link /documents/ADMIN_API_REFERENCE.md}