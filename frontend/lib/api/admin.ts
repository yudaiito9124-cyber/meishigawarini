/**
 * ファイル概要: 管理者用 API クライアント (Admin API Client)
 * 
 * 役割:
 * システム管理者 (System Admin) が使用するバックエンド API との通信を管理します。
 * AWS Amplify による認証情報 (ID Token) の取得、共通ヘッダーの付加、
 * プロキシベースの動的なエンドポイント解決を提供します。
 * 
 * 主要機能:
 * 1. 認証トークンの自動取得と Authorization ヘッダーへの付与。
 * 2. プロキシ (`Proxy`) を利用した、メソッド名から API パスへの自動変換。
 * 3. 統一されたエラーハンドリング。
 */

import { fetchAuthSession } from 'aws-amplify/auth';
import { AdminApiSchema } from '@shared/api-types';

/** API のベース URL (環境変数から取得) */
const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── ベースAPI定義 ──────────────────────────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 管理者用 API クライアントの基底実装
 * 管理者機能を一箇所に集約し、安全なトークン管理と一貫したヘッダー設定を提供します。
 */
export const adminApiBase = {
    /**
     * 基本となる fetch ラッパー
     * 
     * @param path APIエンドポイントのパス (例: "/admin_links")
     * @param options Fetch オプション (method, body, headers 等)
     * @returns API レスポンスの JSON オブジェクト
     * @throws {status: number, message: string} 通信エラーまたは API エラー発生時
     */
    async fetch(path: string, options: RequestInit = {}) {
        // 現在の Amplify セッションから ID トークンを取得
        const session = await fetchAuthSession();
        const token = session.tokens?.idToken?.toString();

        // 認証トークンがない場合はエラー (未ログイン状態)
        if (!token) {
            throw new Error("No authorization token found");
        }

        // リクエストヘッダーの構成
        const headers = {
            ...options.headers,
            "authorization": `Bearer ${token}`, // Bearer 形式でトークンを付与
            // body がある場合は content-type を application/json に設定
            "content-type": options.body ? "application/json" : (options.headers as any)?.["content-type"] || undefined,
        };

        // ベースURLとパスを結合して fetch 実行
        const res = await fetch(`${NEXT_PUBLIC_API_URL}${path.startsWith('/') ? '' : '/'}${path}`, {
            ...options,
            headers,
        });

        // ステータスコードが 2xx 以外の場合はエラーとして扱う
        if (!res.ok) {
            const error = await res.json().catch(() => ({ message: res.statusText }));
            throw { status: res.status, ...error };
        }

        return res.json();
    },

    /**
     * POST リクエストの簡易ラッパー
     * 
     * @param path APIエンドポイントのパス
     * @param data 送信する JSON データ
     */
    async fetch_post(path: string, data: any) {
        return this.fetch(path, { method: "POST", body: JSON.stringify(data) });
    },

    /** 
     * 管理者権限の有効性確認用エンドポイント 
     * /admin への GET リクエストを送信し、トークンの正当性を検証します。
     */
    async check() {
        return this.fetch("/admin");
    },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── プロキシ生成ロジック ────────────────────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * プロキシベースの API クライアント生成関数
 * 
 * オブジェクトのプロパティアクセスをラップし、
 * `adminApi.admin_links(data)` と呼び出すと `/admin/links` へ POST する挙動を実現します。
 * 
 * @param base 基底となる adminApiBase オブジェクト
 * @returns 型定義されたプロキシクライアント
 */
function createAdminApi<T extends Record<string, any>>(base: typeof adminApiBase) {
    return new Proxy(base, {
        get(target, prop: string) {
            // 基底オブジェクトにプロパティが存在する場合はそれを返す (fetch, fetch_post, check 等)
            if (prop in target) return (target as any)[prop];

            // プロパティ名を API パスに変換 (例: admin_links -> /admin/links)
            const path = "/" + (prop as string).replace(/_/g, "/");

            // 自動的に POST リクエストを行う関数を返す
            return (data: any) => (target as any).fetch_post(path, data);
        }
    }) as typeof adminApiBase & { [K in keyof T]: (data: T[K]) => Promise<any> }
}

/**
 * 外部公開用の API クライアントインスタンス
 * 
 * 使用例:
 * const result = await adminApi.admin_links({ ... });
 * 
 * 詳細は以下のドキュメントを参照してください。
 * {@link /documents/ADMIN_API_REFERENCE.md}
 */
export const adminApi = createAdminApi<AdminApiSchema>(adminApiBase);