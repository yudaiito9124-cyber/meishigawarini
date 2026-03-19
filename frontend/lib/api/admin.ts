import { fetchAuthSession } from 'aws-amplify/auth';

const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";

/**
 * 管理者用 API クライアント
 * 管理者機能を一箇所に集約し、安全なトークン管理と一貫したヘッダー設定を提供します。
 */
export const adminApi = {
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

        const res = await fetch(`${NEXT_PUBLIC_API_URL}${path}`, {
            ...options,
            headers,
        });

        if (!res.ok) {
            const error = await res.json().catch(() => ({ message: res.statusText }));
            throw { status: res.status, ...error };
        }

        return res.json();
    },

    // --- QRコード関連 ---

    /** QRコードバッチ生成 */
    async generateQRCodes(data: { count: number; card_design?: string;[key: string]: any }) {
        return this.fetch("/admin/qrcodes/generate", {
            method: "POST",
            body: JSON.stringify(data),
        });
    },

    /** QRコード一覧取得 */
    async listQRCodes(status: string, keyword?: string) {
        let url = `/admin/qrcodes?status=${status}`;
        if (status === 'SEARCH' && keyword) {
            url += `&keyword=${encodeURIComponent(keyword)}`;
        }
        return this.fetch(url);
    },

    /** BAN済みQRコードの全削除 */
    async deleteAllBanned() {
        return this.fetch("/admin/qrcodes/banned", {
            method: "DELETE",
        });
    },
    /** QRコードのBAN処理 */
    async banQRCode(uuid: string, data: { reason: string; status: string }) {
        return this.fetch(`/admin/qrcodes/${uuid}/ban`, {
            method: "POST",
            body: JSON.stringify(data),
        });
    },

    // --- カードデザイン関連 ---

    /** デザイン一覧取得 */
    async listCardDesigns() {
        return this.fetch("/admin/card-designs");
    },

    /** デザインの保存/更新 */
    async saveCardDesign(data: any, id?: string) {
        return this.fetch(id ? `/admin/card-designs/${id}` : "/admin/card-designs", {
            method: id ? "PATCH" : "POST",
            body: JSON.stringify(data),
        });
    },

    /** デザインの削除 */
    async deleteCardDesign(id: string) {
        return this.fetch(`/admin/card-designs/${id}`, {
            method: "DELETE",
        });
    },

    /** デザイン画像のアップロードURL取得 */
    async getUploadUrl(data: { filename: string; contentType: string; design_id: string }) {
        return this.fetch("/admin/card-designs/upload-url", {
            method: "POST",
            body: JSON.stringify(data),
        });
    },

    // --- ショップ・オーナー管理 ---

    /** ショップオーナーの変更 */
    async changeShopOwner(data: { shopId: string, newUserId: string, action: "validate" | "execute" }) {
        return this.fetch(`/admin/owner-change`, {
            method: "POST",
            body: JSON.stringify(data),
        });
    },

    /** マネージャーの紐づけ */
    async linkManager(data: { shopIds: string[]; userIds: string[]; action: "validate" | "execute" }) {
        return this.fetch("/admin/links", {
            method: "POST",
            body: JSON.stringify(data),
        });
    },

    // --- その他 ---

    /** データダンプ取得 */
    async dumpData(url: string) {
        return this.fetch(`/admin/dump?${url}`);
    },

    /** 疎通確認 (Authorizerチェック) */
    async checkAuth() {
        return this.fetch("/admin");
    }
};
