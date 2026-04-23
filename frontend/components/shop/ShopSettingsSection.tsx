'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Settings, ShoppingBasket, Eye, Plus, Trash2, Copy, Check, ImageIcon, Save, Loader2, ChevronDown, Download, MoreVertical, UserMinus, Store, Code, User, Truck, Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { shopApi } from '@/lib/api/shop';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import SandboxedHtml from '@/components/SandboxedHtml';
import { generateId } from '@/lib/id';
import { resizeImage } from "@/lib/image-utils";
import { useShop } from '@/context/ShopContext';
import { useSettingsUI } from '@/store/useShopStore';
import { useBackendError } from '@/hooks/useBackendError';
import { isValidPhone, isValidZip, sanitizePhoneForInput, sanitizeZipForInput } from '@/lib/validation/contact';
import { Checkbox } from '@/components/ui/checkbox';

export function ShopSettingsSection({ shopId }: { shopId: string }) {
    const t = useTranslations('ShopPage');
    const tr = useTranslations('ReceivePage');
    const { translateError } = useBackendError();
    const [shopPostalCode, setShopPostalCode] = useState('');
    const [shopPhone, setShopPhone] = useState('');
    const [shopRecipientName, setShopRecipientName] = useState('');
    const [shortestDeliveryDays, setShortestDeliveryDays] = useState('');
    const [deliveryTimeOptionsText, setDeliveryTimeOptionsText] = useState('');

    const { shop, userId, refreshShopDetails } = useShop();
    const {
        isSettingsOpen, isBasicSettingsOpen, isHtmlEditorOpen, isSettingUploading,
        debouncedPreviewHtml, htmlImageUrls, htmlImageUrlsToDelete,
        isHtmlImageSectionOpen, isUploadingHtmlImage,
        sessionUploadedUrls, adminEmails, copiedId, isAdminSectionOpen, isDeliverySettingsOpen,
        isNotificationSettingsOpen, orderNotificationUserIds, inquiryNotificationUserIds,
        set: setSettings
    } = useSettingsUI();

    const shopDetailRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (shop && isSettingsOpen) {
            setShopPostalCode(shop.shop_postal_code || '');
            setShopPhone(shop.shop_phone || '');
            setShopRecipientName(shop.shop_recipient_name || '');
            setShortestDeliveryDays(shop.shortest_delivery_days !== undefined ? String(shop.shortest_delivery_days) : '');
            setDeliveryTimeOptionsText(Array.isArray(shop.delivery_time_options) ? shop.delivery_time_options.join('\n') : '');
            setSettings({
                htmlImageUrls: shop.html_image_urls || [],
                debouncedPreviewHtml: shop.detail_html || '',
                isHtmlImageSectionOpen: false,
                isUploadingHtmlImage: false,
                htmlImageUrlsToDelete: [],
                sessionUploadedUrls: [],
                orderNotificationUserIds: shop.order_notification_user_ids || [],
                inquiryNotificationUserIds: shop.inquiry_notification_user_ids || []
            });
        }
    }, [isSettingsOpen, shop]);

    const fetchAdminEmails = async () => {
        try {
            const data = await shopApi.shop_admins({ shop_id: shopId });
            setSettings({ adminEmails: data });
        } catch (e) { }
    };

    const handleSettingsOpenChange = async (open: boolean) => {
        if (!open && sessionUploadedUrls.length > 0) {
            try {
                await shopApi.shop_delete_images({ shop_id: shopId, urls: sessionUploadedUrls });
            } catch (e) { }
            setSettings({ sessionUploadedUrls: [] });
        }
        if (open) fetchAdminEmails();
        setSettings({
            isSettingsOpen: open,
            isAdminSectionOpen: false,
            isBasicSettingsOpen: false,
            isDeliverySettingsOpen: false,
            isHtmlEditorOpen: false,
            isNotificationSettingsOpen: false
        });
    };

    const handleHtmlImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setSettings({ isUploadingHtmlImage: true });
        try {
            let uploadFile: File | Blob = file;
            if (file.type.startsWith("image/")) {
                try { uploadFile = await resizeImage(file); } catch (err) { }
            }

            const resData = await shopApi.shop_products_uploadurl({
                shop_id: shopId,
                filename: `${generateId()}.webp`,
                content_type: 'image/webp',
                folder: 'shopcontent'
            });

            const uploadUrl = resData.uploadUrl;
            const publicUrl = resData.publicUrl || resData.fileUrl;
            const viewUrl = resData.viewUrl || publicUrl;

            const res = await fetch(uploadUrl, {
                method: 'PUT',
                body: uploadFile,
                headers: { 'content-type': 'image/webp' }
            });

            if (!res.ok) throw new Error('Failed to upload image (' + res.status + ')');

            setSettings(prev => ({
                htmlImageUrls: [...prev.htmlImageUrls, viewUrl],
                sessionUploadedUrls: [...prev.sessionUploadedUrls, publicUrl]
            }));
        } catch (err: any) {
            alert(t('addProduct.imageUploadFailed') + ': ' + (translateError(err.message, err.detail) || err.message));
        } finally {
            setSettings({ isUploadingHtmlImage: false });
        }
    };

    const handleUpdateShop = async (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        if (shopPostalCode && !isValidZip(shopPostalCode)) {
            alert(tr('errors.invalidZip'));
            return;
        }

        if (shopPhone && !isValidPhone(shopPhone)) {
            alert(tr('errors.invalidPhone'));
            return;
        }

        setSettings({ isSettingUploading: true });

        try {
            await shopApi.shop_details_update({
                shop_id: shopId,
                name: (formData.get('shop_name') as string),
                shop_postal_code: shopPostalCode,
                shop_address: (formData.get('shop_address') as string),
                shop_phone: shopPhone,
                shop_recipient_name: shopRecipientName,
                detail_html: (formData.get('shop_detail_html') as string),
                html_image_urls: htmlImageUrls,
                deleted_html_image_urls: htmlImageUrlsToDelete,
                shortest_delivery_days: shortestDeliveryDays !== '' ? parseInt(shortestDeliveryDays, 10) : undefined,
                delivery_time_options: deliveryTimeOptionsText.trim() !== '' ? deliveryTimeOptionsText.split('\n').map(s => s.trim()).filter(s => s !== '') : undefined,
                order_notification_user_ids: orderNotificationUserIds,
                inquiry_notification_user_ids: inquiryNotificationUserIds
            });

            alert(t('shopSettings.success'));
            setSettings({ sessionUploadedUrls: [], isSettingsOpen: false });
            await refreshShopDetails();
        } catch (err: any) {
            alert(t('shopSettings.error') + ': ' + (translateError(err.message, err.detail) || err.message || String(err)));
        } finally {
            setSettings({ isSettingUploading: false });
        }
    };

    const handleUpdatePreview = () => {
        if (shopDetailRef.current) {
            setSettings({ debouncedPreviewHtml: shopDetailRef.current.value });
        }
    };

    const handleCopy = (id: string | undefined) => {
        if (!id) return;
        navigator.clipboard.writeText(id).then(() => {
            setSettings({ copiedId: id });
            setTimeout(() => setSettings({ copiedId: null }), 2000);
        });
    };

    const [isAddingManager, setIsAddingManager] = useState(false);
    const [isTransferringOwner, setIsTransferringOwner] = useState(false);

    const handleLinkAdmin = async (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const userIdToLink = formData.get('userIdToLink') as string;

        if (!userIdToLink) return;

        setIsAddingManager(true);
        try {
            // まずユーザーの存在確認を行い、メールアドレスを取得する
            const validationData = await shopApi.shop_admins_validate({ shop_id: shopId, user_id: userIdToLink });
            const targetUser = validationData.users?.[0];

            if (!targetUser) {
                alert(t('shopSettings.userNotFound'));
                return;
            }

            // メールアドレスを表示して最終確認
            if (!confirm(t('shopSettings.addManagerConfirm', { email: targetUser.email }))) {
                return;
            }

            await shopApi.shop_admins_link({ shop_id: shopId, user_id: userIdToLink });
            alert(t('shopSettings.success'));
            form.reset();
            await fetchAdminEmails();
            await refreshShopDetails();
        } catch (err: any) {
            alert(t('shopSettings.error') + ': ' + (translateError(err.message, err.detail) || err.message || String(err)));
        } finally {
            setIsAddingManager(false);
        }
    };

    const handleTransferOwner = async (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const newUserId = formData.get('newUserId') as string;

        if (!newUserId) return;

        setIsTransferringOwner(true);
        try {
            // バリデーション
            const validation = await shopApi.shop_owner_transfer_validate({ shop_id: shopId, new_user_id: newUserId });

            // 最終確認
            if (!confirm(t('shopSettings.ownerTransferConfirm', {
                shopName: validation.shopName,
                oldEmail: validation.oldOwnerEmail,
                newEmail: validation.newOwnerEmail
            }))) {
                return;
            }

            await shopApi.shop_owner_transfer_execute({ shop_id: shopId, new_user_id: newUserId });
            alert(t('shopSettings.success'));
            window.location.reload(); // オーナーが変わるのでリロードして権限を再計算させる
        } catch (err: any) {
            alert(t('shopSettings.error') + ': ' + (translateError(err.message, err.detail) || err.message || String(err)));
        } finally {
            setIsTransferringOwner(false);
        }
    };

    const handleUnlinkAdmin = async (managerUserId: string) => {
        if (!confirm(t('shopSettings.unlinkConfirm'))) return;

        try {
            await shopApi.shop_admins_unlink({ shop_id: shopId, user_id: managerUserId });
            alert(t('shopSettings.success'));
            await fetchAdminEmails();
            await refreshShopDetails();
        } catch (err: any) {
            alert(t('shopSettings.error') + ': ' + (translateError(err.message, err.detail) || err.message || String(err)));
        }
    };

    return (
        <Dialog open={isSettingsOpen} onOpenChange={handleSettingsOpenChange}>
            <DialogTrigger asChild>
                <Button variant="outline" size="icon" className="text-gray-500 hover:text-gray-900 cursor-pointer rounded-full">
                    <Settings className="h-5 w-5" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[98vw] w-full sm:max-w-[98vw] max-h-[98vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t('shopSettings.title')}</DialogTitle>
                    <DialogDescription>{t('shopSettings.description')}</DialogDescription>
                </DialogHeader>
                <div>
                    <div className="border border-gray-100 rounded-2xl mt-4 shadow-sm">
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full flex justify-between items-center text-gray-600 px-4 py-7 rounded-2xl hover:bg-gray-50 border-gray-100 shadow-sm group transition-all"
                            onClick={() => setSettings({ isAdminSectionOpen: !isAdminSectionOpen })}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg transition-colors ${isAdminSectionOpen ? 'bg-red-100 text-red-900' : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200'}`}>
                                    <User className="w-5 h-5" />
                                </div>
                                <div className="flex flex-col items-start">
                                    <span className="font-bold text-gray-900">{t('shopSettings.adminSettings')}</span>
                                    <span className="text-[10px] text-gray-400 font-medium">{t('shopSettings.adminSettingsDesc')}</span>
                                </div>
                            </div>
                            <ChevronDown className={`w-5 h-5 text-gray-300 transition-transform duration-300 ${isAdminSectionOpen ? 'rotate-180' : 'rotate-0'}`} />
                        </Button>

                        {isAdminSectionOpen && (
                            <div className="p-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                <AdminInfo
                                    adminEmails={adminEmails}
                                    t={t}
                                    onUnlink={handleUnlinkAdmin}
                                    onLink={handleLinkAdmin}
                                    isAdding={isAddingManager}
                                    isOwner={userId === shop?.owner_id}
                                    onTransfer={handleTransferOwner}
                                    isTransferring={isTransferringOwner}
                                    currentUserId={userId}
                                    onCopy={handleCopy}
                                    copiedId={copiedId}
                                />
                            </div>
                        )}
                    </div>
                    {isAdminSectionOpen && (<div className="mb-10" />)}

                    <form onSubmit={handleUpdateShop} className="">
                        <div className="border border-gray-100 rounded-2xl mt-4 shadow-sm">
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full flex justify-between items-center text-gray-600 px-4 py-7 rounded-2xl hover:bg-gray-50 border-gray-100 shadow-sm group transition-all"
                                onClick={() => setSettings({ isBasicSettingsOpen: !isBasicSettingsOpen })}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg transition-colors ${isBasicSettingsOpen ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200'}`}>
                                        <Store className="w-5 h-5" />
                                    </div>
                                    <div className="flex flex-col items-start">
                                        <span className="font-bold text-gray-900">{t('shopSettings.basicSettings')}</span>
                                        <span className="text-[10px] text-gray-400 font-medium">{t('shopSettings.basicSettingsDesc')}</span>
                                    </div>
                                </div>
                                <ChevronDown className={`w-5 h-5 text-gray-300 transition-transform duration-300 ${isBasicSettingsOpen ? 'rotate-180' : 'rotate-0'}`} />
                            </Button>

                            {isBasicSettingsOpen && (
                                <div className="space-y-4 py-4 animate-in fade-in slide-in-from-top-2 duration-300 p-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="shop_name">{t('shopSettings.name')}</Label>
                                        <Input id="shop_name" name="shop_name" defaultValue={shop?.name} required className="rounded-xl h-11" />
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div className="space-y-2">
                                            <Label htmlFor="shop_postal_code">{t('shopSettings.shopPostalCode')}</Label>
                                            <Input
                                                id="shop_postal_code"
                                                name="shop_postal_code"
                                                value={shopPostalCode}
                                                onChange={(e) => setShopPostalCode((prev) => sanitizeZipForInput(e.target.value, prev))}
                                                placeholder={t('shopSettings.shopPostalCodePlaceholder')}
                                                className="rounded-xl h-11"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="shop_phone">{t('shopSettings.shopPhone')}</Label>
                                            <Input
                                                id="shop_phone"
                                                name="shop_phone"
                                                value={shopPhone}
                                                onChange={(e) => setShopPhone((prev) => sanitizePhoneForInput(e.target.value, prev))}
                                                placeholder={t('shopSettings.shopPhonePlaceholder')}
                                                className="rounded-xl h-11"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="shop_recipient_name">{t('shopSettings.shopRecipientName')}</Label>
                                        <Input
                                            id="shop_recipient_name"
                                            name="shop_recipient_name"
                                            value={shopRecipientName}
                                            onChange={(e) => setShopRecipientName(e.target.value)}
                                            placeholder={t('shopSettings.shopRecipientNamePlaceholder')}
                                            className="rounded-xl h-11"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="shop_address">{t('shopSettings.shopAddress')}</Label>
                                        <Input
                                            id="shop_address"
                                            name="shop_address"
                                            defaultValue={shop?.shop_address || ''}
                                            placeholder={t('shopSettings.shopAddressPlaceholder')}
                                            className="rounded-xl h-11"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                        {isBasicSettingsOpen && (<div className="mb-10" />)}


                        <div className="border border-gray-100 rounded-2xl mt-4 shadow-sm">
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full flex justify-between items-center text-gray-600 px-4 py-7 rounded-2xl hover:bg-gray-50 border-gray-100 shadow-sm group transition-all"
                                onClick={() => setSettings({ isDeliverySettingsOpen: !isDeliverySettingsOpen })}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg transition-colors ${isDeliverySettingsOpen ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200'}`}>
                                        <Truck className="w-5 h-5" />
                                    </div>
                                    <div className="flex flex-col items-start">
                                        <span className="font-bold text-gray-900">{t('shopSettings.deliverySettings')}</span>
                                        <span className="text-[10px] text-gray-400 font-medium">{t('shopSettings.deliverySettingsDesc')}</span>
                                    </div>
                                </div>
                                <ChevronDown className={`w-5 h-5 text-gray-300 transition-transform duration-300 ${isDeliverySettingsOpen ? 'rotate-180' : 'rotate-0'}`} />
                            </Button>

                            {isDeliverySettingsOpen && (
                                <div className="space-y-4 py-4 animate-in fade-in slide-in-from-top-2 duration-300 p-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="shortest_delivery_days">{t('shopSettings.shortestDeliveryDays')}</Label>
                                        <Input
                                            id="shortest_delivery_days"
                                            type="number"
                                            value={shortestDeliveryDays}
                                            onChange={(e) => setShortestDeliveryDays(e.target.value)}
                                            placeholder="3"
                                            className="rounded-xl h-11"
                                        />
                                        <p className="text-[10px] text-gray-400 font-medium">{t('shopSettings.shortestDeliveryDaysDesc')}</p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="delivery_time_options">{t('shopSettings.deliveryTimeOptions')}</Label>
                                        <textarea
                                            id="delivery_time_options"
                                            value={deliveryTimeOptionsText}
                                            onChange={(e) => setDeliveryTimeOptionsText(e.target.value)}
                                            placeholder={"午前中\n14-16時\n16-18時\n18-20時\n19-21時"}
                                            className="flex min-h-[120px] w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                        />
                                        <p className="text-[10px] text-gray-400 font-medium">{t('shopSettings.deliveryTimeOptionsDesc')}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                        {isDeliverySettingsOpen && (<div className="mb-10" />)}


                        <div className="border border-gray-100 rounded-2xl mt-4 shadow-sm">
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full flex justify-between items-center text-gray-600 px-4 py-7 rounded-2xl hover:bg-gray-50 border-gray-100 shadow-sm group transition-all"
                                onClick={() => setSettings({ isHtmlEditorOpen: !isHtmlEditorOpen })}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg transition-colors ${isHtmlEditorOpen ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200'}`}>
                                        <Code className="w-5 h-5" />
                                    </div>
                                    <div className="flex flex-col items-start">
                                        <span className="font-bold text-gray-900">{t('shopSettings.htmlSettings')}</span>
                                        <span className="text-[10px] text-gray-400 font-medium">{t('shopSettings.htmlSettingsDesc')}</span>
                                    </div>
                                </div>
                                <ChevronDown className={`w-5 h-5 text-gray-300 transition-transform duration-300 ${isHtmlEditorOpen ? 'rotate-180' : 'rotate-0'}`} />
                            </Button>

                            {isHtmlEditorOpen && (
                                <div className="space-y-4 py-4 animate-in fade-in slide-in-from-top-2 duration-300 p-2">
                                    <HtmlEditor
                                        shopDetailRef={shopDetailRef}
                                        defaultHtml={shop?.detail_html}
                                        debouncedPreviewHtml={debouncedPreviewHtml}
                                        onUpdatePreview={handleUpdatePreview}
                                        t={t} tr={tr}
                                    />
                                    <ImageUploadGrid
                                        htmlImageUrls={htmlImageUrls}
                                        isOpen={isHtmlImageSectionOpen}
                                        setIsOpen={(val) => setSettings({ isHtmlImageSectionOpen: val })}
                                        isUploading={isUploadingHtmlImage}
                                        onUpload={handleHtmlImageUpload}
                                        onDelete={(url, idx) => setSettings(prev => ({
                                            htmlImageUrlsToDelete: [...prev.htmlImageUrlsToDelete, url],
                                            htmlImageUrls: prev.htmlImageUrls.filter((_, i) => i !== idx)
                                        }))}
                                        onCopy={handleCopy}
                                        copiedId={copiedId}
                                        t={t} tr={tr}
                                    />
                                </div>
                            )}
                        </div>
                        {isHtmlEditorOpen && (<div className="mb-10" />)}


                        <div className="border border-gray-100 rounded-2xl mt-4 shadow-sm">
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full flex justify-between items-center text-gray-600 px-4 py-7 rounded-2xl hover:bg-gray-50 border-gray-100 shadow-sm group transition-all"
                                onClick={() => setSettings({ isNotificationSettingsOpen: !isNotificationSettingsOpen })}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg transition-colors ${isNotificationSettingsOpen ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200'}`}>
                                        <Bell className="w-5 h-5" />
                                    </div>
                                    <div className="flex flex-col items-start">
                                        <span className="font-bold text-gray-900">{t('shopSettings.notificationSettings')}</span>
                                        <span className="text-[10px] text-gray-400 font-medium">{t('shopSettings.notificationSettingsDesc')}</span>
                                    </div>
                                </div>
                                <ChevronDown className={`w-5 h-5 text-gray-300 transition-transform duration-300 ${isNotificationSettingsOpen ? 'rotate-180' : 'rotate-0'}`} />
                            </Button>

                            {isNotificationSettingsOpen && (
                                <div className="p-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <NotificationSettings
                                        adminEmails={adminEmails}
                                        orderUserIds={orderNotificationUserIds}
                                        inquiryUserIds={inquiryNotificationUserIds}
                                        onUpdateOrder={(uids) => setSettings({ orderNotificationUserIds: uids })}
                                        onUpdateInquiry={(uids) => setSettings({ inquiryNotificationUserIds: uids })}
                                        t={t}
                                    />
                                </div>
                            )}

                        </div>
                        {isNotificationSettingsOpen && (<div className="mb-10" />)}

                        <DialogFooter className="mt-10">
                            <Button type="submit" className="w-full h-20 rounded-xl text-base font-bold shadow-lg shadow-primary/20" disabled={isSettingUploading}>
                                {isSettingUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : t('shopSettings.submit')}
                            </Button>
                        </DialogFooter>
                    </form>
                    <div className="mt-10 border-t pt-4 space-y-2">
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                            {t('userId')} : {userId}
                            <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => handleCopy(userId)}>
                                {copiedId === userId ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                            </Button>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                            {t('ownerId')} : {shop?.owner_id}
                            <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => handleCopy(shop?.owner_id)}>
                                {copiedId === shop?.owner_id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                            </Button>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                            {t('shopId')} : {shopId}
                            <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => handleCopy(shopId)}>
                                {copiedId === shopId ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

interface AdminInfoProps {
    adminEmails: { owner_email: string, owner_id: string, managers: { user_id: string, email: string }[] } | null;
    t: (key: string) => string;
    onUnlink: (userId: string) => void;
    onLink: (e: React.FormEvent) => void;
    isAdding: boolean;
    isOwner: boolean;
    onTransfer: (e: React.FormEvent) => void;
    isTransferring: boolean;
    currentUserId: string | undefined;
    onCopy: (text: string) => void;
    copiedId: string | null;
}

function AdminInfo({ adminEmails, t, onUnlink, onLink, isAdding, isOwner, onTransfer, isTransferring, currentUserId, onCopy, copiedId }: AdminInfoProps) {
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);

    const admins = [
        ...(adminEmails?.owner_id ? [{
            email: adminEmails.owner_email,
            user_id: adminEmails.owner_id,
            role: 'OWNER'
        }] : []),
        ...(adminEmails?.managers || []).map(m => ({ ...m, role: 'MANAGER' }))
    ];

    return (
        <div className="">
            <div className="space-y-3">
                <Label className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">{t('shopSettings.adminList')}</Label>
                <div className="space-y-2">
                    {admins.map((admin) => {
                        const isCurrentUser = admin.user_id === currentUserId;
                        return (
                            <div key={admin.user_id} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${isCurrentUser ? 'bg-blue-50/50 border-blue-200 shadow-sm' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
                                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-sm font-bold truncate ${isCurrentUser ? 'text-blue-700' : 'text-gray-900'}`}>
                                            {admin.email}
                                        </span>
                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${admin.role === 'OWNER' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                            {admin.role}
                                        </span>
                                        {isCurrentUser && (
                                            <span className="text-[9px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded uppercase tracking-wider">You</span>
                                        )}
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                                            <span className="shrink-0 opacity-60">{t('idLabel')} :</span>
                                            <span className="font-mono truncate">{admin.user_id}</span>
                                            <Button variant="ghost" size="icon" className="h-4 w-4 shrink-0" onClick={() => onCopy(admin.user_id)}>
                                                {copiedId === admin.user_id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 opacity-40 hover:opacity-100" />}
                                            </Button>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                                            <span className="shrink-0 opacity-60">{t('email')} :</span>
                                            <span className="truncate">{admin.email}</span>
                                            <Button variant="ghost" size="icon" className="h-4 w-4 shrink-0" onClick={() => onCopy(admin.email)}>
                                                {copiedId === admin.email ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 opacity-40 hover:opacity-100" />}
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                <div className="relative shrink-0 ml-2">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-gray-400 hover:text-gray-600 rounded-full"
                                        onClick={() => setOpenMenuId(openMenuId === admin.user_id ? null : admin.user_id)}
                                    >
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>

                                    {openMenuId === admin.user_id && (
                                        <>
                                            <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                                            <div className="absolute right-0 top-full mt-1 w-48 bg-white border rounded-xl shadow-xl z-20 overflow-hidden py-1.5 animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                                                <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b mb-1">{t('shopSettings.actions')}</div>
                                                <button
                                                    className="w-full px-4 py-2 text-left text-xs hover:bg-gray-50 flex items-center gap-2.5 transition-colors"
                                                    onClick={() => { onCopy(admin.email); setOpenMenuId(null); }}
                                                >
                                                    <Copy className="h-3.5 w-3.5 text-gray-400" /> {t('shopSettings.copyEmail')}
                                                </button>
                                                <button
                                                    className="w-full px-4 py-2 text-left text-xs hover:bg-gray-50 flex items-center gap-2.5 transition-colors"
                                                    onClick={() => { onCopy(admin.user_id); setOpenMenuId(null); }}
                                                >
                                                    <Copy className="h-3.5 w-3.5 text-gray-400" /> {t('shopSettings.copyUserId')}
                                                </button>
                                                {admin.role === 'MANAGER' && (
                                                    <button
                                                        className="w-full px-4 py-2 text-left text-xs text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition-colors border-t mt-1"
                                                        onClick={() => { onUnlink(admin.user_id); setOpenMenuId(null); }}
                                                    >
                                                        <UserMinus className="h-3.5 w-3.5" /> {t('shopSettings.unlink')}
                                                    </button>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>


            {/* Add Manager Form */}
            <div className="pt-2 mt-2 p-2 rounded-2xl">
                <form onSubmit={onLink} className="space-y-3">
                    <Label className="text-md font-bold px-1">{t('shopSettings.addManager')}</Label>
                    <p className="text-[10px] text-gray-400 italic px-1">{t('shopSettings.addManagerDescription')}</p>
                    <div className="flex gap-2">
                        <Input
                            name="userIdToLink"
                            placeholder={t('shopSettings.addManagerPlaceholder')}
                            className="text-sm h-10 rounded-xl bg-gray-50/50 border-gray-100 focus:bg-white transition-all"
                            required
                        />
                        <Button type="submit" size="sm" className="h-10 px-5 rounded-xl shadow-sm" disabled={isAdding}>
                            {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : t('shopSettings.add')}
                        </Button>
                    </div>
                </form>
            </div>

            <div className="pt-4 border-b" />

            {/* Owner Transfer Form */}
            {isOwner && (
                <div className="pt-2 mt-2 p-2 rounded-2xl">
                    <form onSubmit={onTransfer} className="space-y-3">
                        <div className="flex items-center gap-2 mb-1 px-1">
                            <Label className="text-md font-bold uppercase tracking-wider">{t('shopSettings.ownerTransferTitle')}</Label>
                            <span className="text-[9px] font-black bg-red-600 text-white px-1.5 py-0.5 rounded shadow-sm">{t('shopSettings.danger')}</span>
                        </div>
                        <p className="text-[10px]  font-medium px-1 leading-relaxed">{t('shopSettings.ownerTransferDescription')}</p>
                        <div className="flex gap-2">
                            <Input
                                name="newUserId"
                                placeholder={t('shopSettings.ownerTransferPlaceholder')}
                                className="text-sm h-10 rounded-xl border-red-200 bg-white focus-visible:ring-red-200"
                                required
                            />
                            <Button type="submit" size="sm" variant="destructive" className="h-10 px-5 rounded-xl shadow-md active:scale-95 transition-transform" disabled={isTransferring}>
                                {isTransferring ? <Loader2 className="h-4 w-4 animate-spin" /> : t('shopSettings.changeOwner')}
                            </Button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}

interface HtmlEditorProps {
    shopDetailRef: React.RefObject<HTMLTextAreaElement | null>;
    defaultHtml: string | undefined;
    debouncedPreviewHtml: string;
    onUpdatePreview: () => void;
    t: (key: string) => string;
    tr: (key: string) => string;
}

function HtmlEditor({ shopDetailRef, defaultHtml, debouncedPreviewHtml, onUpdatePreview, t, tr }: HtmlEditorProps) {
    const handleDownloadPrompt = () => {
        const link = document.createElement('a');
        link.href = '/prompts/landing-page-prompt.md';
        link.download = 'landing-page-prompt.md';
        link.click();
    };

    return (
        <div className="space-y-2">
            <Label htmlFor="shop_detail_html">{t('shopSettings.detailHtml')}</Label>
            <div className="border rounded-md overflow-hidden bg-gray-50/30 min-h-[400px] h-[calc(95vh-700px)] flex flex-col lg:flex-row">
                <div className="flex-1 flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r bg-white">
                    <div className="px-3 py-2 bg-gray-50 border-b flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">{t('shopSettings.sourcecode')}</span>
                        <div className="flex gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={handleDownloadPrompt} className="h-7 px-2 text-[10px] gap-1 text-green-600 border-green-200">
                                <Download className="w-3 h-3" />{t('shopSettings.downloadPrompt')}
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={onUpdatePreview} className="h-7 px-2 text-[10px] gap-1 text-blue-600 border-blue-200">
                                <Eye className="w-3 h-3" />{t('shopSettings.updatePreview')}
                            </Button>
                        </div>
                    </div>
                    <textarea ref={shopDetailRef} id="shop_detail_html" name="shop_detail_html" defaultValue={defaultHtml} className="flex-1 w-full p-4 text-sm font-mono focus-visible:outline-none resize-none overflow-y-auto" placeholder={t('shopSettings.detailHtmlPlaceholder')} />
                </div>
                <div className="flex-1 flex flex-col min-h-0 bg-gray-50/50 max-w-2xl">
                    <div className="px-3 py-2 bg-gray-50 border-b flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">{t('shopSettings.preview')}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center">
                        <Card className="w-full mt-10 bg-white p-4">
                            {/* <div className="flex flex-col items-center gap-2 mb-4">
                                <div className="flex items-center gap-2 text-lg font-bold"><ShoppingBasket className="w-5 h-5" />{tr('shopinfo')}</div>
                                <div className="text-xs text-gray-500">{tr('shopinfo_description')}</div>
                            </div> */}
                            <div className="rounded-2xl overflow-hidden bg-white min-h-[200px]">
                                <SandboxedHtml html={debouncedPreviewHtml} />
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}

interface ImageUploadGridProps {
    htmlImageUrls: string[];
    isOpen: boolean;
    setIsOpen: (val: boolean) => void;
    isUploading: boolean;
    onUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
    onDelete: (url: string, idx: number) => void;
    onCopy: (url: string) => void;
    copiedId?: string | null;
    t: (key: string) => string;
    tr: (key: string) => string;
}

function ImageUploadGrid({ htmlImageUrls, isOpen, setIsOpen, isUploading, onUpload, onDelete, onCopy, copiedId, t, tr }: ImageUploadGridProps) {
    return (
        <div className="space-y-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center text-gray-500 px-2">
                <div className="flex items-center gap-2"><ImageIcon className="w-4 h-4" /><span className="font-semibold">{tr('senderInfo.labels.detail_html-images')}</span></div>
                <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : 'rotate-0'}`} />
            </Button>
            {isOpen && (
                <div className="space-y-4 p-4 bg-gray-50/50 rounded-lg border border-dashed">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {htmlImageUrls.map((url: string, index: number) => (
                            <div key={url || index} className="group relative aspect-square bg-white rounded-md border overflow-hidden shadow-sm hover:ring-2 hover:ring-primary/30 transition-all">
                                <img src={url} alt="" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <Button type="button" variant="secondary" size="icon" className="h-8 w-8 rounded-full" onClick={() => onCopy(url)}>
                                        {copiedId === url ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                                    </Button>
                                    <Button type="button" variant="destructive" size="icon" className="h-8 w-8 rounded-full" onClick={() => onDelete(url, index)}><Trash2 className="h-4 w-4" /></Button>
                                </div>
                            </div>
                        ))}
                        <label className="flex flex-col items-center justify-center aspect-square bg-white rounded-md border border-dashed hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-all group">
                            {isUploading ? <Loader2 className="w-6 h-6 animate-spin text-primary" /> : (
                                <><Plus className="w-6 h-6 text-gray-400 group-hover:text-primary" /><span className="text-[10px] text-gray-400 group-hover:text-primary">{tr('senderInfo.labels.detail_html-addimage')}</span></>
                            )}
                            <input type="file" className="hidden" accept="image/*" onChange={onUpload} disabled={isUploading} />
                        </label>
                    </div>
                </div>
            )}
        </div>
    );
}

interface NotificationSettingsProps {
    adminEmails: { owner_email: string, owner_id: string, managers: { user_id: string, email: string }[] } | null;
    orderUserIds: string[];
    inquiryUserIds: string[];
    onUpdateOrder: (uids: string[]) => void;
    onUpdateInquiry: (uids: string[]) => void;
    t: (key: string) => string;
}

function NotificationSettings({ adminEmails, orderUserIds, inquiryUserIds, onUpdateOrder, onUpdateInquiry, t }: NotificationSettingsProps) {
    const admins = [
        ...(adminEmails?.owner_id ? [{
            email: adminEmails.owner_email,
            user_id: adminEmails.owner_id,
            role: 'OWNER'
        }] : []),
        ...(adminEmails?.managers || []).map(m => ({ ...m, user_id: m.user_id, email: m.email, role: 'MANAGER' }))
    ];

    const toggleUser = (uids: string[], userId: string, updateFn: (uids: string[]) => void) => {
        if (uids.includes(userId)) {
            updateFn(uids.filter(id => id !== userId));
        } else {
            updateFn([...uids, userId]);
        }
    };

    return (
        <div className="space-y-4">
            <Label className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">{t('shopSettings.notificationList')}</Label>

            <div className="overflow-x-auto border rounded-xl bg-white shadow-sm">
                <table className="w-full text-sm ">
                    <thead>
                        <tr className="bg-gray-50/50 border-b">
                            <th className="px-4 py-3 text-left font-bold text-gray-600 ">{t('shopSettings.user')}</th>
                            <th className="px-4 py-3 text-center font-bold text-gray-600 min-w-[100px]">{t('shopSettings.orderNotifications')}</th>
                            <th className="px-4 py-3 text-center font-bold text-gray-600 min-w-[100px]">{t('shopSettings.inquiryNotifications')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {admins.map((admin) => (
                            <tr key={admin.user_id} className="hover:bg-gray-50/30 transition-colors ">
                                <td className="px-4 py-3 max-w-[300px]">
                                    <div className="flex flex-col">
                                        <span className="font-medium text-gray-900 truncate" title={admin.email}>
                                            {admin.email}
                                        </span>
                                        <span className="text-[10px] text-gray-400 font-mono">{admin.user_id}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <div className="flex justify-center">
                                        <Checkbox
                                            checked={orderUserIds.includes(admin.user_id)}
                                            onCheckedChange={() => toggleUser(orderUserIds, admin.user_id, onUpdateOrder)}
                                            className="h-5 w-5 rounded-md"
                                        />
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <div className="flex justify-center">
                                        <Checkbox
                                            checked={inquiryUserIds.includes(admin.user_id)}
                                            onCheckedChange={() => toggleUser(inquiryUserIds, admin.user_id, onUpdateInquiry)}
                                            className="h-5 w-5 rounded-md"
                                        />
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {admins.length === 0 && (
                            <tr>
                                <td colSpan={3} className="px-4 py-8 text-center text-gray-400 italic">
                                    {t('shopSettings.noAdminsFound')}
                                </td>
                            </tr>
                        )}
                        <tr>
                            <td className="text-sm text-gray-400 text-center px-4 py-2">{t('shopSettings.notificationDesc')}</td>
                            <td className="text-sm text-gray-400 text-center px-4 py-2">{t('shopSettings.orderNotificationsDesc')}</td>
                            <td className="text-sm text-gray-400 text-center px-4 py-2">{t('shopSettings.inquiryNotificationsDesc')}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
