import React from 'react';

type ChatAttachmentProps = {
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
};

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)$/i;

function isImageAttachment(fileName?: string, fileUrl?: string): boolean {
    if (fileName && IMAGE_EXT_RE.test(fileName)) return true;
    if (fileUrl) {
        const cleanUrl = fileUrl.split('?')[0];
        return IMAGE_EXT_RE.test(cleanUrl);
    }
    return false;
}

function formatSizeKb(fileSize?: number): string {
    if (!fileSize || fileSize <= 0) return '';
    return `(${(fileSize / 1024).toFixed(1)} KB)`;
}

export default function ChatAttachment({ fileUrl, fileName, fileSize }: ChatAttachmentProps) {
    if (!fileUrl) return null;

    const image = isImageAttachment(fileName, fileUrl);

    return (
        <div className="mt-2 pt-2 border-t">
            {image && (
                <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="block w-fit max-w-full">
                    <img
                        src={fileUrl}
                        alt={fileName || 'Attached image'}
                        className="max-h-72 w-auto max-w-full rounded-md border object-contain bg-white"
                        loading="lazy"
                    />
                </a>
            )}

            <div className={image ? 'mt-2' : ''}>
                <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                    download={fileName}
                >
                    📎 {fileName || 'Attached file'}
                </a>
                {fileSize ? <span className="text-xs text-gray-600 ml-2">{formatSizeKb(fileSize)}</span> : null}
            </div>
        </div>
    );
}