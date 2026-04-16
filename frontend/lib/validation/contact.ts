export function normalizeDigitsAndHyphen(rawValue: string): string {
    return rawValue
        .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
        .replace(/[ー‐―－]/g, '-')
        .replace(/[^0-9-]/g, '');
}

export function sanitizePhoneForInput(rawValue: string, previousValue: string): string {
    let filtered = normalizeDigitsAndHyphen(rawValue);

    const parts = filtered.split('-');
    if (parts.length > 3) {
        filtered = parts.slice(0, 3).join('-') + parts.slice(3).join('');
    }

    const digitsOnly = filtered.replace(/-/g, '');
    if (digitsOnly.length > 11) {
        return previousValue;
    }

    return filtered;
}

export function sanitizeZipForInput(rawValue: string, previousValue: string): string {
    let filtered = normalizeDigitsAndHyphen(rawValue);

    const parts = filtered.split('-');
    if (parts.length > 2) {
        filtered = parts.slice(0, 2).join('-') + parts.slice(3).join('');
    }

    const digitsOnly = filtered.replace(/-/g, '');
    if (digitsOnly.length > 7) {
        return previousValue;
    }

    return filtered;
}

export function countDigits(value: string): number {
    return value.replace(/\D/g, '').length;
}

export function isValidZip(value: string): boolean {
    return countDigits(value) === 7;
}

export function isValidPhone(value: string): boolean {
    const digits = countDigits(value);
    return digits >= 10 && digits <= 11;
}
