/**
 * 参加者ID（USER#/SHOP#/ADMIN）を画面表示用の統一フォーマットへ変換します。
 * 例:
 * - USER#550e8400-e29b-41d4-a716-446655440000 -> USER-550E8400E29B41D4A716446655440000
 * - SHOP#b4c63849-b497-472f-9f33-67e915158201 -> SHOP-B4C63849B497472F9F3367E915158201
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
    const suffix = suffixRaw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (!suffix) return `${kind}-UNKNOWN`;

    return `${kind}-${suffix}`;
}