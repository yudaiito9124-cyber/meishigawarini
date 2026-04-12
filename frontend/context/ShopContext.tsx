'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';
import { shopApi } from '@/lib/api/shop';
import { notFound } from 'next/navigation';

interface ShopContextType {
    shopId: string;
    shop: any;
    products: any[];
    cardOrders: any[];
    orders: any[];
    user: any;
    isAdmin: boolean;
    singleShopOwner: boolean;
    userId: string;
    
    // Loading states
    shopLoading: boolean;
    productsLoading: boolean;
    cardOrdersLoading: boolean;
    ordersLoading: boolean;
    userLoading: boolean;

    // Refresh functions
    refreshShopDetails: () => Promise<void>;
    refreshProducts: () => Promise<void>;
    refreshCardOrders: () => Promise<void>;
    refreshOrders: () => Promise<void>;
    refreshAll: () => Promise<void>;
}

const ShopContext = createContext<ShopContextType | undefined>(undefined);

export function ShopProvider({ children, shopId }: { children: React.ReactNode, shopId: string }) {
    const [shop, setShop] = useState<any>(null);
    const [products, setProducts] = useState<any[]>([]);
    const [cardOrders, setCardOrders] = useState<any[]>([]);
    const [orders, setOrders] = useState<any[]>([]);
    const [user, setUser] = useState<any>(null);
    const [userId, setUserId] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);
    const [singleShopOwner, setSingleShopOwner] = useState(true);
    const [isNotFound, setIsNotFound] = useState(false);

    const [shopLoading, setShopLoading] = useState(false);
    const [productsLoading, setProductsLoading] = useState(false);
    const [cardOrdersLoading, setCardOrdersLoading] = useState(false);
    const [ordersLoading, setOrdersLoading] = useState(false);
    const [userLoading, setUserLoading] = useState(false);

    const refreshShopDetails = useCallback(async () => {
        if (!shopId) return;
        setShopLoading(true);
        try {
            const [shopDetails, shops] = await Promise.all([
                shopApi.shop_details_get({ shop_id: shopId }),
                shopApi.shop_list({})
            ]);
            setShop(shopDetails);
            setSingleShopOwner((shops.shops || []).length <= 1);
        } catch (e: any) {
            console.error('Failed to fetch shop details', e);
            // 権限がない(403)または存在しない(404)場合は、
            // ステートを更新してレンダリングフェーズでnotFound()をトリガーします。
            if (e.status === 403 || e.status === 404) {
                setIsNotFound(true);
            }
        } finally {
            setShopLoading(false);
        }
    }, [shopId]);

    const refreshProducts = useCallback(async () => {
        if (!shopId) return;
        setProductsLoading(true);
        try {
            const data = await shopApi.shop_products_list({ shop_id: shopId });
            setProducts(data.products || data.items || []);
        } catch (e) {
            // console.error('Failed to fetch products', e);
        } finally {
            setProductsLoading(false);
        }
    }, [shopId]);

    const refreshCardOrders = useCallback(async () => {
        if (!shopId) return;
        setCardOrdersLoading(true);
        try {
            const data = await shopApi.shop_card_orders_list({ shop_id: shopId });
            setCardOrders(data.items || []);
        } catch (e) {
            // console.error('Failed to fetch card orders', e);
        } finally {
            setCardOrdersLoading(false);
        }
    }, [shopId]);

    const refreshOrders = useCallback(async () => {
        if (!shopId) return;
        setOrdersLoading(true);
        try {
            const data = await shopApi.shop_orders_list({ shop_id: shopId });
            setOrders(data.orders || data.items || []);
        } catch (e) {
            // console.error('Failed to fetch incoming orders', e);
        } finally {
            setOrdersLoading(false);
        }
    }, [shopId]);

    const fetchUser = useCallback(async () => {
        setUserLoading(true);
        try {
            const [session, currentUser] = await Promise.all([
                fetchAuthSession(),
                getCurrentUser()
            ]);
            setUser(currentUser);
            setUserId(currentUser.userId);
            
            if (session.tokens) {
                const groups = (session.tokens.idToken?.payload['cognito:groups'] as string[]) || [];
                setIsAdmin(groups.includes('Administrators') || groups.includes('GlobalAdmins'));
            }
        } catch (e) {
            // console.error('Failed to fetch user', e);
        } finally {
            setUserLoading(false);
        }
    }, []);

    const refreshAll = useCallback(async () => {
        await Promise.all([
            refreshShopDetails(),
            refreshProducts(),
            refreshCardOrders(),
            refreshOrders(),
            fetchUser()
        ]);
    }, [refreshShopDetails, refreshProducts, refreshCardOrders, refreshOrders, fetchUser]);

    // 権限エラーが確定している場合は、このレンダリングフェーズでnotFoundを投げる
    if (isNotFound) {
        notFound();
    }

    // Initial load
    useEffect(() => {
        if (shopId) {
            refreshAll();
        }
    }, [shopId, refreshAll]);

    return (
        <ShopContext.Provider value={{
            shopId,
            shop,
            products,
            cardOrders,
            orders,
            user,
            isAdmin,
            singleShopOwner,
            userId,
            shopLoading,
            productsLoading,
            cardOrdersLoading,
            ordersLoading,
            userLoading,
            refreshShopDetails,
            refreshProducts,
            refreshCardOrders,
            refreshOrders,
            refreshAll
        }}>
            {children}
        </ShopContext.Provider>
    );
}

export function useShop() {
    const context = useContext(ShopContext);
    if (context === undefined) {
        throw new Error('useShop must be used within a ShopProvider');
    }
    return context;
}
