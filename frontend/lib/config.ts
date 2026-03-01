/**
 * ファイル概要: アプリケーションの共通設定定数
 * 目的: QRコードのロゴパスや有効期限など、アプリ全体で参照される設定値を一括管理します。
 */
export const APP_CONFIG = {
    QR_LOGO_PATH: '/presenticon.png',
    DEFAULT_VALID_DAYS: parseInt(process.env.DEFAULT_VALID_DAYS || '1'),
};
