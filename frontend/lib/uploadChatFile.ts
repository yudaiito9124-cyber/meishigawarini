/**
 * @file uploadChatFile.ts
 * @role チャット添付ファイルのアップロードユーティリティ
 * @responsibility
 *  - Presigned URL 取得 → S3 PUT → ファイルメタデータ返却 の一連フローを集約します。
 *  - admin/page.tsx の AdminInquiryChatSection / ShopOpeningInquirySection と
 *    UnifiedChatNotifications.tsx の 3 箇所で共通利用されます。
 */

export interface ChatFileData {
    file_url: string;
    file_name: string;
    file_size: number;
}

/**
 * チャット添付ファイルを S3 へアップロードし、メッセージ送信用のファイルメタデータを返します。
 *
 * @param apiFetchPost - `/unified/chat/uploadurl/get` を呼び出せる fetch ラッパー
 *                       (adminApi.fetch_post または apiFetchPost を渡す)
 * @param chatId       - 送信先チャット ID
 * @param file         - アップロード対象ファイル
 * @returns ファイルメタデータ（file_url / file_name / file_size）
 * @throws  S3 アップロード失敗時
 */
export async function uploadChatFile(
    apiFetchPost: (path: string, body: object) => Promise<any>,
    chatId: string,
    file: File,
): Promise<ChatFileData> {
    const uploadRes = await apiFetchPost('/unified/chat/uploadurl/get', {
        chat_id: chatId,
        filename: file.name,
        content_type: file.type || 'application/octet-stream',
        file_size: file.size,
    });

    const putRes = await fetch(uploadRes.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
    });

    if (!putRes.ok) {
        throw new Error('S3 upload failed');
    }

    return {
        file_url: uploadRes.fileUrl,
        file_name: file.name,
        file_size: file.size,
    };
}
