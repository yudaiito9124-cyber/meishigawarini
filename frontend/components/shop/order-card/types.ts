export interface Product {
    product_id: string;
    design_id: string;
    name: string;
    image_url?: string;
    design?: any;
    [key: string]: any;
}
