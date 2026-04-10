/**
 * ファイル概要: 受取人用 API クライアント (Recipient API Client)
 * 
 * 役割:
 * ギフトを受け取るユーザーが使用するバックエンド API との通信を管理します。
 * 通常の ID トークン認証に加え、QRコードごとに割り当てられた `qr_id` と `pin` 
 * をリクエストヘッダーに含めることで、特定のギフトに対する操作権限を証明します。
 * 
 * 主要機能:
 * 1. QR ID と PIN をヘッダー (`x-qr-id`, `x-qr-pin`) に付与した fetch 実行。
 * 2. ログイン済みユーザーの場合は ID トークンも併用するハイブリッド認証。
 * 3. プロキシ (`Proxy`) を利用した、エンドポイントの動的解決。
 */

import { fetchAuthSession } from 'aws-amplify/auth';
import { ReceiveApiSchema } from '@shared/api-types';

/** API のベース URL */
const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── ベースAPI定義 ──────────────────────────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 受取人 (Receive) 用 API クライアントの基底実装
 * QRコードのUUIDとPINを使用した独自の認証方式を採用しています。
 */
export const receiveApiBase = {
    /**
     * 基本となる fetch ラッパー
     * 
     * @param path APIエンドポイントのパス (例: "/receive/submit")
     * @param qr_id QRコードの識別子 (UUID)
     * @param pin QRコードに紐付く PIN コード
     * @param options Fetch オプション
     * @returns API レスポンス
     * @throws エラーレスポンス (404の場合はPIN無効メッセージを付与)
     */
    async fetch(path: string, qr_id: string, pin: string, options: RequestInit = {}) {
        /*
          Safari で未ログイン時に fetchAuthSession() を呼び出すと
          処理が停止（ハング）する場合があるためのワークアラウンド。
          localStorage を確認し、Amplify 関連のキーがある場合のみ ID トークン取得を試みる。
        */
        const hasSessionHint = typeof window !== 'undefined' && 
            Object.keys(localStorage).some(key => key.startsWith('CognitoIdentityServiceProvider'));

        const idToken = hasSessionHint 
            ? await fetchAuthSession()
                .then(session => session.tokens?.idToken?.toString())
                .catch(() => undefined)
            : undefined;

        // ヘッダー構成: PIN認証 + (もしあれば) ユーザー認証
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
            /* 
              API Gateway の Authorizer で 401/403 が返された場合、
              セキュリティ上の理由で 404 に偽装されることがある。
              受取人画面では「存在しない」＝「PIN間違い」としてユーザーに伝える。
            */
            if (res.status === 404) {
                throw { status: 404, message: "QRコードが無効か、PINが正しくありません。" };
            }
            const error = await res.json().catch(() => ({ message: res.statusText }));
            throw { status: res.status, ...error };
        }

        return res.json();
    },

    /**
     * POST リクエストのラッパー
     */
    async fetch_post(path: string, qr_id: string, pin: string, data: any) {
        return this.fetch(path, qr_id, pin, { method: "POST", body: JSON.stringify(data) });
    },

    /** 
     * PIN検証
     * /receive/verify へのリクエスト。
     * 初回アクセス時や、パスワード保護されているギフトのロック解除に使用。
     * 
     * @param qr_id QRコードID
     * @param pin PINコード
     * @param password ギフトに設定されたパスワード (任意)
     */
    async verify(qr_id: string, pin: string, password?: string) {
        const res = await fetch(`${NEXT_PUBLIC_API_URL}/receive/verify`, {
            method: 'POST',
            headers: { 
                'content-type': 'application/json',
                'x-qr-id': qr_id,
                'x-qr-pin': pin
            },
            body: JSON.stringify({ qr_id, pin, password })
        });
        if (!res.ok) throw await res.json().catch(() => ({ message: res.statusText }));
        return res.json();
    },

    /** 
     * Share用公開情報の取得 (GET /share/{qr_id})
     * 認証不要でアクセス可能な、SNS共有等に使用される情報の取得。
     */
    async share_get(qr_id: string) {
        const res = await fetch(`${NEXT_PUBLIC_API_URL}/share/${qr_id}`);
        if (!res.ok) throw await res.json().catch(() => ({ message: res.statusText }));
        return res.json();
    }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── プロキシ生成ロジック ────────────────────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * プロキシベースの API クライアント生成
 * プロパティ名を API パスに変換します。
 * recieveApi.receive_submit(...) -> /receive/submit への POST
 */
function createReceiveApi<T extends Record<string, any>>(base: typeof receiveApiBase) {
    return new Proxy(base, {
        get(target, prop: string) {
            if (prop in target) return (target as any)[prop];
            // アンダースコアをスラッシュに変換 (例: receive_chat -> /receive/chat)
            const path = "/" + (prop as string).replace(/_/g, "/");
            return (qr_id: string, pin: string, data: any) => (target as any).fetch_post(path, qr_id, pin, data);
        }
    }) as typeof receiveApiBase & { [K in keyof T]: (qr_id: string, pin: string, data: T[K]) => Promise<any> }
}

/** 外部公開用のインスタンス */
export const receiveApi = createReceiveApi<ReceiveApiSchema>(receiveApiBase);

