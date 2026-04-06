/**
 * 概要: フロントエンドとバックエンドで共有されるAPIの型定義
 * 目的: APIのリクエストボディなどの型を一本化し、静的な型チェックを可能にします。
 */

// ==========================================
// Admin API
// ==========================================
export type AdminApiSchema = {
    // 管理
    admin_check: {};
    admin_dump: { pks: string[] }; //PKでレコードを取得
    admin_links: { shop_ids: string[]; user_ids: string[]; action: "validate" | "execute" }; //ショップと別の管理者をリンク
    admin_changeowner: { shop_id: string, new_user_id: string, action: "validate" | "execute" }; // ショップのオーナー変更
    admin_shop_create: { name: string; description?: string; owner_id?: string; gm_ids?: string[] }; // ショップの作成
    admin_shop_carddesign_link_get: { shop_id: string }; // ショップとカードデザインの紐付け取得
    admin_shop_carddesign_link_update: { shop_id: string; card_designs: string[] }; // ショップとカードデザインの紐付け更新
    // QRコード
    admin_qr_ban: { qr_id: string; reason?: string }; //QRコードをBAN / 解除
    admin_qr_deleteban: { target?: string }; //BANされたQRコードを削除 (指定がない場合は全件)
    admin_qr_generate: {
        order_id: string;
    }; //QRコードを生成 (CardOrderに基づく)
    admin_qr_list: { status: string, keyword?: string, limit?: number }; //QRコードのリストを取得 (limit: 取得件数制限)
    // カードデザイン
    admin_carddesigns_list: {}; //カードデザインのリストを取得
    admin_carddesigns_create: { design_id: string; design: { [key: string]: any } }; //カードデザインを作成
    admin_carddesigns_update: { design_id: string; design: { [key: string]: any } }; //カードデザインを更新
    admin_carddesigns_delete: { design_id: string }; //カードデザインを削除
    admin_carddesigns_uploadurl: { filename: string; content_type: string; design_id: string }; //カードデザインのアップロードURLを取得
    admin_card_orders_list: { status: string, limit?: number, last_key?: any }; //カード発注のリストを取得
    admin_card_orders_create: {
        shop_id: string;
        quantity: number;
        design_id: string;
        product_id?: string;
        shop_user_id?: string;
        sender_user_id?: string;
        expiration_date?: string;
        activate_now?: boolean;
    };
    admin_card_orders_update: {
        shop_id: string,
        order_id: string,
        status: string,
        batch_id?: string
    }; //カード発注のステータス更新
    admin_qr_batch_get: { batch_id: string }; //バッチIDからQRコードリストを取得
};

// ==========================================
// Shop API
// ==========================================
export type ShopApiSchema = {
    shop_list: { no_create?: boolean };
    shop_details_get: { shop_id: string };
    shop_details_update: { shop_id: string; name?: string; description?: string; detail_html?: string; html_image_urls?: string[]; deleted_html_image_urls?: string[] };
    shop_admins: { shop_id: string };
    shop_delete_images: { shop_id: string; keys?: string[]; urls?: string[] };
    shop_orders_list: { shop_id: string; qr_id?: string };
    shop_orders_update: { shop_id: string; qr_id: string; status?: string; delivery_company?: string; tracking_number?: string; memo_for_users?: string; memo_for_shop?: string };
    shop_products_list: { shop_id: string };
    shop_products_create: { shop_id: string; name: string; description?: string; image_url?: string; price?: number; valid_days?: number; detail_html?: string; design_id: string };
    shop_products_update: { shop_id: string; product_id: string; status?: "ACTIVE" | "STOPPED"; name?: string; description?: string; image_url?: string; price?: number; valid_days?: number; detail_html?: string; design_id?: string };
    shop_products_delete: { shop_id: string; product_id: string };
    shop_products_import_list: { shop_id: string };
    shop_products_import_execute: { shop_id: string; source_shop_id: string; product_ids?: string[] };
    shop_products_uploadurl: { shop_id: string; filename: string; content_type: string; folder?: string };
    shop_qr_list: { shop_id: string };
    shop_qr_link: { shop_id: string; qr_id: string; product_id: string; activate_now?: boolean; memo_for_users?: string; memo_for_shop?: string };
    shop_qr_activate: { shop_id: string; qr_id: string };
    shop_qrcodecheck: { shop_id: string; qr_id: string };
    shop_card_orders_create: { shop_id: string; quantity: number; design_id: string; product_id?: string; shop_user_id?: string; sender_user_id?: string; expiration_date?: string; activate_now?: boolean };
    shop_card_orders_list: { shop_id: string };
    shop_card_orders_cancel: { shop_id: string; order_id: string };
    shop_card_orders_complete: { shop_id: string; order_id: string };
};

// ==========================================
// Receive API
// ==========================================
export type ReceiveApiSchema = {
    receive_verify: { qr_id: string; pin: string; password?: string };
    receive_submit: {
        shipping_info: {
            name: string;
            address: string;
            zip_code: string;
            phone?: string;
            email?: string;
            preferred_date?: string;
            preferred_time?: string;
            client_timestamp?: string;
        };
        password?: string;
    };
    receive_completed: {};
    receive_chat_get: {};
    receive_chat_send: { username: string; message?: string; type?: string; file_url?: string; file_name?: string; file_size?: number; file_type?: string };
    receive_subscription: { email: string; locale: string };
    receive_sender_update: { sender_info: any; deleted_html_image_urls?: string[]; locale?: string };
    receive_sender_load: { id: string };
    receive_sender_save: { sender_info: any; id?: string };
    receive_sender_delete_images: { urls: string[] };
    receive_uploadurl_get: { filename: string; content_type: string; file_size: number; folder?: string };
};

// ==========================================
// User API
// ==========================================
export type UserApiSchema = {
    user_profile_get: {};
    user_profile_update: { profile: any; deleted_html_image_urls?: string[] };
    user_profile_uploadurl: { filename: string; content_type: string };
    user_receiver_get: {};
    user_receiver_update: { receiver_info: any };
    user_history_get: {};
    user_history_sendgift: { qr_id: string; pin?: string };
};

// ==========================================
// Public / Share API
// ==========================================
export type PublicApiSchema = {
    share_get: { qr_id: string };
};
