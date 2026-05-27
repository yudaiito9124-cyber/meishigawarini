/**
 * 参加者ID（USER#/SHOP#/ADMIN）を画面表示用の統一フォーマットへ変換します。
 * 例:
 * - USER#550e8400-e29b-41d4-a716-446655440000 -> USER-550e8400-e29b-41d4-a716-446655440000
 * - SHOP#b4c63849-b497-472f-9f33-67e915158201 -> SHOP-b4c63849-b497-472f-9f33-67e915158201
 * - ADMIN -> ADMIN
 */
export function toDisplayParticipantId(rawId?: string): string {
    const id = String(rawId || '').trim();
    if (!id) return '-';

    if (id === 'ADMIN' || id.startsWith('ADMIN#')) {
        return 'ADMIN';
    }

    const m = id.match(/^(USER|SHOP)#(.+)$/i);
    if (!m) return id;

    const kind = m[1].toUpperCase();
    const suffixRaw = m[2];
    const suffix = suffixRaw.trim();
    if (!suffix) return `${kind}-UNKNOWN`;

    return `${kind}-${suffix}`;
}