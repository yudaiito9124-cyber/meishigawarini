export interface Order {
    qr_id: string;
    id?: string;
    status: string;
    product_id?: string;
    ts_updated_at?: string;
    ts_created_at?: string;
    recipient_name?: string;
    address?: string;
    postal_code?: string;
    preferred_date?: string;
    preferred_time?: string;
    memo_for_shop?: string;
    memo_for_users?: string;
    thumbf?: string;
    thumbb?: string;
    design_id?: string;
    shipping_info?: {
        phone?: string;
        email?: string;
    };
    [key: string]: any;
}

export interface ColumnOption {
    key: string;
    label: string;
    icon: React.ReactNode;
}

export interface ColumnGroup {
    title: string;
    columns: ColumnOption[];
}
