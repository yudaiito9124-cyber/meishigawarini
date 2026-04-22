/**
 * @file api-types.ts
 * @role フロントエンド・バックエンド共有 API スキマ定義
 * @responsibility
 *  - システム全体の API リクエストペイロードの型定義を一本化し、開発時の型安全性を保証します。
 *  - 【契約としての型】フロントエンドが送信すべきデータ構造と、バックエンドが期待する構造の「単一の真実（Single Source of Truth）」として機能します。
 *  - 各サブシステム（Admin, Shop, User, Receive, Public）ごとに独立した型定義を提供し、大規模なインターフェースを整理しています。
 * @context
 *  - フロントエンドの API クライアントおよびバックエンドの Lambda ハンドラーの両方でインポートされ、インターフェースの不整合をコンパイル時に検知します。
 */

// ==========================================
// Admin API
// ==========================================
export type AdminApiSchema = {
    // 管理
    admin_check: {};
    admin_dump: { pks?: string[], keys?: { pk: string, sk: string }[], gsi2_pks?: string[] }; //PKのみ、またはPK+SKでレコードを取得
    admin_links: { shop_ids: string[]; user_ids: string[]; action: "validate" | "execute" | "unlink" }; //ショップと別の管理者をリンク・解除
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
    admin_card_orders_get: { order_id: string }; //特定のカード発注を取得
    admin_qr_batch_get: { batch_id: string }; //バッチIDからQRコードリストを取得
};

// ==========================================
// Shop API
// ==========================================
export type ShopApiSchema = {
    shop_list: { no_create?: boolean };
    shop_details_get: { shop_id: string };
    shop_details_update: {
        shop_id: string;
        name?: string;
        description?: string;
        detail_html?: string;
        html_image_urls?: string[];
        deleted_html_image_urls?: string[];
        shop_postal_code?: string;
        shop_address?: string;
        shop_phone?: string;
        shop_recipient_name?: string;
    };
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
    receive_inquiry: { reply_email: string; phone: string; content: string };
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

// ==========================================
// Unified Chat API (Type Contract)
// NOTE: 実装側（frontend / infra/lambda/unified_chat.ts）で稼働中のため、
// ここは設計メモではなく API 入出力型の正本として扱います。
// ==========================================
export type UnifiedChatApiSchema = {
    unified_chat_create: {
        chat_type: string;
        participants: string[];
        initiator_id: string;
        title?: string;
        initial_message?: {
            type?: 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM' | 'WORKFLOW';
            message?: string;
            payload_type?: string;
            payload?: Record<string, unknown>;
        };
    };

    unified_chat_list: {
        participant_id: string;
        chat_type?: string;
        status?: string;
        limit?: number;
        cursor?: string;
        include_archived?: boolean;
    };

    unified_chat_get: {
        chat_id: string;
    };

    unified_chat_messages_get: {
        chat_id: string;
        before_seq?: number;
        limit?: number;
    };

    unified_chat_messages_send: {
        chat_id: string;
        sender_id: string;
        type: 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM' | 'WORKFLOW';
        message?: string;
        payload_type?: string;
        payload?: Record<string, unknown>;
        workflow_status?: string;
        file_url?: string;
        file_name?: string;
        file_size?: number;
    };

    unified_chat_read_mark: {
        chat_id: string;
        participant_id: string;
        last_read_seq: number;
    };

    unified_chat_status_update: {
        chat_id: string;
        next_status: string;
        expected_version: number;
    };

    unified_chat_uploadurl_get: {
        chat_id: string;
        filename: string;
        content_type: string;
        file_size: number;
    };
};
