'use client';

import React, { useEffect, useRef } from 'react';
import { Settings, ShoppingBasket, Eye, Plus, Trash2, Copy, Check, ImageIcon, Save, Loader2, ChevronDown, Download } from 'lucide-react';
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

export function ShopSettingsSection({ shopId }: { shopId: string }) {
    const t = useTranslations('ShopPage');
    const tr = useTranslations('ReceivePage');
    const { translateError } = useBackendError();

    const { shop, userId, refreshShopDetails } = useShop();
    const {
        isSettingsOpen, isSettingShowHTML, isSettingUploading,
        debouncedPreviewHtml, htmlImageUrls, htmlImageUrlsToDelete,
        isHtmlImageSectionOpen, isUploadingHtmlImage,
        sessionUploadedUrls, adminEmails, copiedId,
        set: setSettings
    } = useSettingsUI();

    const shopDetailRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (shop && isSettingsOpen) {
            setSettings({
                htmlImageUrls: shop.html_image_urls || [],
                debouncedPreviewHtml: shop.detail_html || '',
                isHtmlImageSectionOpen: false,
                isUploadingHtmlImage: false,
                htmlImageUrlsToDelete: [],
                sessionUploadedUrls: []
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
        setSettings({ isSettingsOpen: open, isSettingShowHTML: false });
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
        setSettings({ isSettingUploading: true });

        try {
            await shopApi.shop_details_update({
                shop_id: shopId,
                name: (formData.get('shop_name') as string),
                detail_html: (formData.get('shop_detail_html') as string),
                html_image_urls: htmlImageUrls,
                deleted_html_image_urls: htmlImageUrlsToDelete
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

    return (
        <Dialog open={isSettingsOpen} onOpenChange={handleSettingsOpenChange}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-gray-500 hover:text-gray-900 cursor-pointer">
                    <Settings className="h-5 w-5" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[98vw] w-full sm:max-w-[98vw] max-h-[98vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t('shopSettings.title')}</DialogTitle>
                    <DialogDescription>{t('shopSettings.description')}</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleUpdateShop} className="space-y-4 py-4">
                    <AdminInfo adminEmails={adminEmails} t={t} />

                    <div className="space-y-2">
                        <Label htmlFor="shop_name">{t('shopSettings.name')}</Label>
                        <Input id="shop_name" name="shop_name" defaultValue={shop?.name} required />
                    </div>

                    {isSettingShowHTML ? (
                        <div className="space-y-2">
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
                    ) : (
                        <div className="flex w-full justify-center items-center">
                            <Button variant="ghost" className="text-xs text-gray-500" onClick={() => setSettings({ isSettingShowHTML: true })}>
                                <ChevronDown className="w-4 h-4 mr-1" />{t('shopSettings.detailHtml')}
                            </Button>
                        </div>
                    )}

                    <DialogFooter>
                        <Button type="submit" className="w-full" disabled={isSettingUploading}>
                            {isSettingUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('shopSettings.submit')}
                        </Button>
                    </DialogFooter>
                </form>
                <div className="border-t pt-4 space-y-2">
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
            </DialogContent>
        </Dialog>
    );
}

interface AdminInfoProps {
    adminEmails: { owner_email: string, manager_emails: string[] } | null;
    t: (key: string) => string;
}

function AdminInfo({ adminEmails, t }: AdminInfoProps) {
    return (
        <div className="space-y-4 py-2 border-b pb-4">
            <div className="space-y-1">
                <Label className="text-xs text-gray-500">{t('shopSettings.ownerEmail')}</Label>
                <div className="text-sm font-medium">{adminEmails?.owner_email || '---'}</div>
            </div>
            {adminEmails?.manager_emails && adminEmails.manager_emails.length > 0 && (
                <div className="space-y-1">
                    <Label className="text-xs text-gray-500">{t('shopSettings.managerEmails')}</Label>
                    <div className="flex flex-wrap gap-2">
                        {adminEmails.manager_emails.map((email: string, idx: number) => (
                            <div key={idx} className="bg-gray-100 px-2 py-0.5 rounded text-xs font-medium">{email}</div>
                        ))}
                    </div>
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
            <div className="border rounded-md overflow-hidden bg-gray-50/30 min-h-[400px] h-[calc(95vh-500px)] flex flex-col lg:flex-row">
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
                <div className="flex-1 flex flex-col min-h-0 bg-gray-50/50">
                    <div className="px-3 py-2 bg-gray-50 border-b flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">{t('shopSettings.preview')}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center">
                        <Card className="w-full mt-10 max-w-full bg-white p-4">
                            <div className="flex flex-col items-center gap-2 mb-4">
                                <div className="flex items-center gap-2 text-lg font-bold"><ShoppingBasket className="w-5 h-5" />{tr('shopinfo')}</div>
                                <div className="text-xs text-gray-500">{tr('shopinfo_description')}</div>
                            </div>
                            <div className="rounded-2xl overflow-hidden border shadow-sm bg-white min-h-[200px]">
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
                <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-0' : '240'}`} />
            </Button>
            {isOpen && (
                <div className="space-y-4 p-4 bg-gray-50/50 rounded-lg border border-dashed">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {htmlImageUrls.map((url: string, index: number) => (
                            <div key={index} className="group relative aspect-square bg-white rounded-md border overflow-hidden shadow-sm hover:ring-2 hover:ring-primary/30 transition-all">
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
