/**
 * Centralized CORS Header Definitions
 * Used by both Infra (CDK) and Lambda (Backend)
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
