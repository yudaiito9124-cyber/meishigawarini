/**
 * @file constants.ts
 * @role システム共通定数定義
 * @responsibility
 *  - インフラ（CDK）とアプリケーション（Lambda）の両層で使用される、横断的な定数（主に通信ヘッダー）を管理します。
 *  - 【CORS 戦略の集中管理】
 *    各 API（Admin, Shop, User, Receive）が個別に必要とするカスタムヘッダー（x-qr-id, x-shop-id 等）を体系化し、
 *    API Gateway の Preflight 応答と Lambda の実応答ヘッダーの一貫性を維持します。
 * @context
 *  - セキュリティと可用性のバランスを保つための、通信プロトコルの定義層として機能します。
 */

export const CORS_HEADERS = {
    // Base headers used by almost all requests
    base: [
        'authorization',
        'content-type',
        'x-amz-date',
        'x-api-key',
        'x-amz-security-token',
        'x-amz-user-agent'
    ],
    // QR related headers (used by Receive, User, and Shop APIs)
    qr: [
        'x-qr-id',
        'x-qr-pin'
    ],
    // Shop management specific headers
    shop: [
        'x-shop-id',
        'x-product-id'
    ]
} as const;

export const ADMIN_ALLOW_HEADERS = [
    ...CORS_HEADERS.base,
    ...CORS_HEADERS.qr
];

export const SHOP_ALLOW_HEADERS = [
    ...CORS_HEADERS.base,
    ...CORS_HEADERS.qr,
    ...CORS_HEADERS.shop
];

export const USER_ALLOW_HEADERS = [
    ...CORS_HEADERS.base,
    ...CORS_HEADERS.qr
];

export const RECEIVE_ALLOW_HEADERS = [
    ...CORS_HEADERS.base,
    ...CORS_HEADERS.qr
];

// Union of ALL possible headers for GatewayResponse
export const ALL_ALLOW_HEADERS = Array.from(new Set([
    ...ADMIN_ALLOW_HEADERS,
    ...SHOP_ALLOW_HEADERS,
    ...USER_ALLOW_HEADERS,
    ...RECEIVE_ALLOW_HEADERS
]));

/**
 * Join headers into a comma-separated string for Lambda responses
 */
export const joinHeaders = (headers: string[]) => headers.join(',');
