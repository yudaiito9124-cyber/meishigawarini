/**
 * @file id.ts
 * @role 統一 ID 生成ユーティリティ
 * @responsibility
 *  - システム全体で一貫したフォーマットのユニーク ID（ソート可能かつ衝突耐性の高い ID）を生成します。
 *  - フロントエンド側の `frontend/lib/id.ts` と同一のアルゴリズムを提供し、クライアント・サーバー間での ID 生成の整合性を保ちます。
 * @context
 *  - 新規データ（ショップ、注文、QR コード等）を作成する際のプライマリキー生成に使用されます。
 */

import * as crypto from 'crypto';

/**
 * 独自アルゴリズムに基づいた統一 ID を生成します。
 * 
 * @description
 * 生成される ID のフォーマット: `{UTCタイムスタンプ}{ランダム英小文字3文字}-{UUID}`
 * 例: `20240408103000abc-123e4567-e89b-12d3-a456-426614174000`
 * 
 * 【設計意図】
 * 1. 視認性: 先頭 14 桁を見るだけで、そのデータがいつ作成されたかを人間が即座に判別可能です。
 * 2. ソート順: 文字列比較において作成日時順に並ぶ性質を持ち、DynamoDB のソートキー（SK）等で時間の範囲検索を容易にします。
 * 3. 衝突回避: 秒単位のタイムスタンプ + 3 文字のランダム文字列 + UUID を組み合わせることで、高頻度な生成時でも一意性を完全に保証します。
 * 
 * @returns 生成されたユニークな ID 文字列。
 */
export function generateId(): string {
    const pad = (n: number) => n.toString().padStart(2, '0');

    // 実行環境（地域設定）に依存せず一貫性を保つため、常に UTC 時間を使用します。
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = pad(now.getUTCMonth() + 1);
    const d = pad(now.getUTCDate());
    const h = pad(now.getUTCHours());
    const min = pad(now.getUTCMinutes());
    const s = pad(now.getUTCSeconds());

    // タイムスタンプの直後に 3 文字のランダムな英文字を追加し、同一秒内の衝突確率を低減します。
    const randomStr = [...Array(3)]
        .map(() => String.fromCharCode(Math.floor(Math.random() * 26) + 97))
        .join('')
    const timestamp = `${y}${m}${d}${h}${min}${s}${randomStr}`;
    
    // 最終的な一意性を保証するための UUID。
    const random_uuid = crypto.randomUUID();

    return `${timestamp}-${random_uuid}`;
}
