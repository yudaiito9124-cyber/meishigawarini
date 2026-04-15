'use client';

import React, { useEffect, useState } from 'react';
import { RefreshCw, Copy, Check, ChevronDown, LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { fetchUserAttributes, signOut } from 'aws-amplify/auth';
import { Button } from '@/components/ui/button';
import { shopApi } from '@/lib/api/shop';
import { UnifiedChatNotifications } from '@/components/chat/UnifiedChatNotifications';

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

    const [isCopied, setIsCopied] = useState(false);
    const [currentUserEmail, setCurrentUserEmail] = useState('');

    useEffect(() => {
        const loadUserEmail = async () => {
            try {
                const attrs = await fetchUserAttributes();
                setCurrentUserEmail(attrs.email || '');
            } catch {
                setCurrentUserEmail('');
            }
        };
        loadUserEmail();
    }, []);

    const handleCopyId = () => {
        navigator.clipboard.writeText(shopId).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        });
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
                            {isCopied ? (
                                <Check className="h-3 w-3 text-green-500" />
                            ) : (
                                <Copy className="h-3 w-3" />
                            )}
                        </Button>
                    </div>
                </div>

                <div className="flex items-center space-x-2">
                    {/*
                     * ─── ショップ向け通知ベルボタン ───────────────────────────────────────────
                     * UnifiedChatNotifications はショップとユーザー双方で使い回せる共用コンポーネントです。
                     * ショップとして呼び出す際は以下の Props を設定します:
                     *
                     *   participantId:
                     *     "SHOP#" + shopId の形式にします。
                     *     バックエンドはこのIDでDynamoDB GSI2 (CHAT_INBOX#SHOP#xxx) を検索します。
                     *
                     *   apiFetchPost:
                     *     shopApi.fetch_post.bind(shopApi) を渡します。
                     *     .bind() によって this コンテキストを固定し、
                     *     呼び出し時に Cognito ショップ認証トークンが付与されます。
                     *
                     *   translationNamespace:
                     *     "ShopPage" を指定することで、ja.json / en.json の
                     *     ShopPage.notifications.* 以下のテキストが使用されます。
                     * ─────────────────────────────────────────────────────────────────────────
                     */}
                    <UnifiedChatNotifications
                        participantId={`SHOP#${shopId}`}
                        apiFetchPost={shopApi.fetch_post.bind(shopApi)}
                        translationNamespace="ShopPage"
                        currentUserEmail={currentUserEmail}
                        buttonClassName="text-mist-500 hover:text-mist-800 relative rounded-full"
                    />

                    <ShopSettingsSection
                        shopId={shopId}
                    />

                    {(!singleShopOwner || isAdmin) && (
                        <Button variant="outline" className="text-mist-500 hover:text-mist-800 rounded-full" onClick={handleShops}>
                            <ChevronDown className="h-4 w-4 mr-1 rotate-90" /> {t('movetoshops')}
                        </Button>
                    )}
                    
                    {(singleShopOwner && !isAdmin) && (
                        <Button variant="outline" className="text-mist-500 hover:text-mist-800 rounded-full" onClick={handleLogin}>
                            <ChevronDown className="h-4 w-4 mr-1 rotate-90" /> {t('movetologin')}
                        </Button>
                    )}

                    <Button
                        variant="outline"
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
