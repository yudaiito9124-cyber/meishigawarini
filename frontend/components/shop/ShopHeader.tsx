'use client';

import React from 'react';
import { RefreshCw, Copy, ChevronDown, LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { signOut } from 'aws-amplify/auth';
import { Button } from '@/components/ui/button';

interface ShopHeaderProps {
    shopId: string;
}

import { ShopSettingsSection } from './ShopSettingsSection';
import { useShop } from '@/context/ShopContext';

export function ShopHeader({
    shopId,
}: ShopHeaderProps) {
    const t = useTranslations('ShopPage');
    const router = useRouter();
    const { 
        shop, 
        isAdmin, 
        singleShopOwner, 
        userId, 
        shopLoading, 
        refreshShopDetails 
    } = useShop();

    const handleShops = () => {
        router.push('/shop');
    };

    const handleLogin = () => {
        router.push('/login');
    };

    const handleSignOut = async () => {
        try {
            await signOut();
            router.push('/login');
        } catch (e) {
            // console.error('Sign out error', e);
        }
    };

    const handleCopyId = () => {
        navigator.clipboard.writeText(shopId);
        // We could add a toast here if available
    };

    return (
        <div className="bg-white shadow">
            <div className="max-w-7xl mx-auto px-4 py-6 flex justify-between items-center flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">
                        {shopLoading ? (
                            <RefreshCw className="h-5 w-5 animate-spin text-gray-400 inline-block" />
                        ) : (
                            shop?.name || t('title')
                        )}
                    </h1>
                    <div className="flex items-center gap-1">
                        <p className="text-xs text-gray-500">{t('shopId')} : {shopId}</p>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4 text-gray-400 hover:text-gray-600"
                            onClick={handleCopyId}
                        >
                            <Copy className="h-3 w-3" />
                        </Button>
                    </div>
                </div>

                <div className="flex items-center space-x-2">
                    <ShopSettingsSection
                        shopId={shopId}
                    />

                    {(!singleShopOwner || isAdmin) && (
                        <Button variant="ghost" className="text-mist-500 hover:text-mist-800" onClick={handleShops}>
                            <ChevronDown className="h-4 w-4 mr-1 rotate-90" /> {t('movetoshops')}
                        </Button>
                    )}
                    
                    {(singleShopOwner && !isAdmin) && (
                        <Button variant="ghost" className="text-mist-500 hover:text-mist-800" onClick={handleLogin}>
                            <ChevronDown className="h-4 w-4 mr-1 rotate-90" /> {t('movetologin')}
                        </Button>
                    )}

                    <Button
                        variant="ghost"
                        className="text-mist-500 hover:text-mist-800"
                        onClick={handleSignOut}
                    >
                        <LogOut className="w-5 h-5 mr-2" />
                        {t('logout')}
                    </Button>
                </div>
            </div>
        </div>
    );
}
