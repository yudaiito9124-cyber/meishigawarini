const FILE_PLACEHOLDER_RE = /^\[File: .+\]$/;

/**
 * FILE 添付時のプレースホルダー文字列を UI 表示用に正規化する。
 */
export function getDisplayMessage(message: unknown, fileUrl?: string): string {
    const text = String(message ?? '').trim();
    if (fileUrl && FILE_PLACEHOLDER_RE.test(text)) {
        return '';
    }
    if (text) {
        return text;
    }
    return fileUrl ? '' : '-';
}
