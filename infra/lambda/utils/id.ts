import * as crypto from 'crypto';

/**
 * Generates a unified ID starting with YYYYMMDDHHMMSS followed by a UUID.
 * The timestamp is in UTC.
 */
export function generateId(): string {
    const now = new Date();
    
    const pad = (n: number) => n.toString().padStart(2, '0');
    
    // Using UTC to ensure consistency across different environments/regions
    const y = now.getUTCFullYear();
    const m = pad(now.getUTCMonth() + 1);
    const d = pad(now.getUTCDate());
    const h = pad(now.getUTCHours());
    const min = pad(now.getUTCMinutes());
    const s = pad(now.getUTCSeconds());
    
    const timestamp = `${y}${m}${d}${h}${min}${s}`;
    const uuid = crypto.randomUUID();
    
    return `${timestamp}-${uuid}`;
}
