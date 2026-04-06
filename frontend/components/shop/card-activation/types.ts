export interface ScannedId {
    qr_id: string;
    status?: any;
    error?: string;
}

export interface ActivationStatus {
    status: 'EXPIRED' | 'OK';
    product_linked: boolean;
    product_name?: string;
}
