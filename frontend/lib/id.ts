/**
 * Generates a unified ID starting with YYYYMMDDHHMMSS followed by a UUID.
 * The timestamp is in UTC.
 */
export function generateId(): string {
    const now = new Date();
    
    const pad = (n: number) => n.toString().padStart(2, '0');
    
    const y = now.getUTCFullYear();
    const m = pad(now.getUTCMonth() + 1);
    const d = pad(now.getUTCDate());
    const h = pad(now.getUTCHours());
    const min = pad(now.getUTCMinutes());
    const s = pad(now.getUTCSeconds());
    
    const timestamp = `${y}${m}${d}${h}${min}${s}${now.getUTCMilliseconds().toString().padStart(3, '0')}`;
    
    // Use crypto.randomUUID if available, otherwise fallback to a semi-random string
    let uuid = '';
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        uuid = crypto.randomUUID();
    } else {
        // Fallback for older browsers or non-secure contexts
        uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
    return `${timestamp}-${uuid}`;
}
