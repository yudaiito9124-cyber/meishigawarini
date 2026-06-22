/**
 * @file AdminSettingsSection.tsx
 * @role 管理者画面：システム設定および通知設定ダイアログコンポーネント
 * @responsibility
 *  - システム管理者が Cognito に登録されている管理者（Administrators / GlobalAdmins）のリストを閲覧できるようにします。
 *  - 管理者ごとに物理カード発注通知、およびお問い合わせ通知の送受信設定を行う UI を提供します。
 *  - 設定変更をバックエンド API `/admin/settings` に送信し、適用します。
 * @context
 *  - 管理者ダッシュボード（`frontend/app/[locale]/admin/page.tsx`）のヘッダーにある「システム設定」ボタンからモーダルとして表示されます。
 */

'use client';

import React, { useEffect, useState } from 'react';
import { Settings, Bell, User, Check, Copy, Loader2, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { adminApi } from '@/lib/api/admin';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useBackendError } from '@/hooks/useBackendError';
import { Checkbox } from '@/components/ui/checkbox';

/** 管理者ユーザー情報のインターフェース定義 */
interface AdminUser {
    id: string;
    email?: string;
    name?: string;
    groups?: string[];
}

export function AdminSettingsSection() {
    const t = useTranslations('AdminPage');
    const { translateError } = useBackendError();
    const [isOpen, setIsOpen] = useState(false);
    
    const [isAdminSectionOpen, setIsAdminSectionOpen] = useState(false);
    const [isNotificationSettingsOpen, setIsNotificationSettingsOpen] = useState(false);
    
    const [admins, setAdmins] = useState<AdminUser[]>([]);
    const [orderUserIds, setOrderUserIds] = useState<string[]>([]);
    const [inquiryUserIds, setInquiryUserIds] = useState<string[]>([]);
    
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const data = await adminApi.admin_settings_get({});
            setAdmins(data.admins || []);
            setOrderUserIds(data.settings?.admin_order_notification_user_ids || []);
            setInquiryUserIds(data.settings?.admin_inquiry_notification_user_ids || []);
        } catch (e: any) {
            alert(t('settings.error') + ': ' + (translateError(e.message, e.detail) || e.message));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchData();
        }
    }, [isOpen]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await adminApi.admin_settings_update({
                admin_order_notification_user_ids: orderUserIds,
                admin_inquiry_notification_user_ids: inquiryUserIds
            });
            alert(t('settings.success'));
            setIsOpen(false);
        } catch (e: any) {
            alert(t('settings.error') + ': ' + (translateError(e.message, e.detail) || e.message));
        } finally {
            setIsSaving(false);
        }
    };

    const handleCopy = (id: string | undefined) => {
        if (!id) return;
        navigator.clipboard.writeText(id).then(() => {
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="bg-mist-800 border-mist-700 text-mist-300 hover:bg-mist-700 hover:text-white transition-all duration-300 rounded-full gap-3">
                    <Settings className="h-5 w-5" />{t('settings.title')}
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[98vw] w-full sm:max-w-2xl max-h-[98vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t('settings.title')}</DialogTitle>
                    <DialogDescription>{t('settings.description')}</DialogDescription>
                </DialogHeader>
                
                {isLoading ? (
                    <div className="flex justify-center p-10"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
                ) : (
                    <div>
                        <div className="border border-gray-100 rounded-2xl mt-4 shadow-sm">
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full flex justify-between items-center text-gray-600 px-4 py-7 rounded-2xl hover:bg-gray-50 border-gray-100 shadow-sm group transition-all"
                                onClick={() => setIsAdminSectionOpen(!isAdminSectionOpen)}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg transition-colors ${isAdminSectionOpen ? 'bg-red-100 text-red-900' : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200'}`}>
                                        <User className="w-5 h-5" />
                                    </div>
                                    <div className="flex flex-col items-start">
                                        <span className="font-bold text-gray-900">{t('settings.adminList')}</span>
                                        <span className="text-[10px] text-gray-400 font-medium">{t('settings.adminListDesc')}</span>
                                    </div>
                                </div>
                                <ChevronDown className={`w-5 h-5 text-gray-300 transition-transform duration-300 ${isAdminSectionOpen ? 'rotate-180' : 'rotate-0'}`} />
                            </Button>

                            {isAdminSectionOpen && (
                                <div className="p-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="space-y-2">
                                        {admins.map((admin) => (
                                            <div key={admin.id} className="flex items-center justify-between p-3 rounded-xl border bg-white border-gray-100 hover:border-gray-200 transition-all">
                                                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-sm font-bold text-gray-900 truncate">
                                                            {admin.email}
                                                        </span>
                                                        {admin.groups?.map((role: string) => (
                                                            <span key={role} className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider bg-slate-100 text-slate-600">
                                                                {role}
                                                            </span>
                                                        ))}
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                                                            <span className="shrink-0 opacity-60">ID :</span>
                                                            <span className="font-mono truncate">{admin.id}</span>
                                                            <Button variant="ghost" size="icon" className="h-4 w-4 shrink-0" onClick={() => handleCopy(admin.id)}>
                                                                {copiedId === admin.id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 opacity-40 hover:opacity-100" />}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-xs text-gray-400 mt-3">{t('settings.adminManageDesc')}</p>
                                </div>
                            )}
                        </div>
                        
                        {isAdminSectionOpen && (<div className="mb-10" />)}

                        <form onSubmit={handleSave}>
                            <div className="border border-gray-100 rounded-2xl mt-4 shadow-sm">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full flex justify-between items-center text-gray-600 px-4 py-7 rounded-2xl hover:bg-gray-50 border-gray-100 shadow-sm group transition-all"
                                    onClick={() => setIsNotificationSettingsOpen(!isNotificationSettingsOpen)}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg transition-colors ${isNotificationSettingsOpen ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200'}`}>
                                            <Bell className="w-5 h-5" />
                                        </div>
                                        <div className="flex flex-col items-start">
                                            <span className="font-bold text-gray-900">{t('settings.notificationSettings')}</span>
                                            <span className="text-[10px] text-gray-400 font-medium">{t('settings.notificationSettingsDesc')}</span>
                                        </div>
                                    </div>
                                    <ChevronDown className={`w-5 h-5 text-gray-300 transition-transform duration-300 ${isNotificationSettingsOpen ? 'rotate-180' : 'rotate-0'}`} />
                                </Button>

                                {isNotificationSettingsOpen && (
                                    <div className="p-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="overflow-x-auto border rounded-xl bg-white shadow-sm">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="bg-gray-50/50 border-b">
                                                        <th className="px-4 py-3 text-left font-bold text-gray-600">{t('settings.user')}</th>
                                                        <th className="px-4 py-3 text-center font-bold text-gray-600 min-w-[100px]">{t('settings.orderNotifications')}</th>
                                                        <th className="px-4 py-3 text-center font-bold text-gray-600 min-w-[100px]">{t('settings.inquiryNotifications')}</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y">
                                                    {admins.map((admin) => (
                                                        <tr key={admin.id} className="hover:bg-gray-50/30 transition-colors">
                                                            <td className="px-4 py-3 max-w-[300px]">
                                                                <div className="flex flex-col">
                                                                    <span className="font-medium text-gray-900 truncate" title={admin.email}>
                                                                        {admin.email}
                                                                    </span>
                                                                    <span className="text-[10px] text-gray-400 font-mono">{admin.id}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3 text-center">
                                                                <div className="flex justify-center">
                                                                    <Checkbox
                                                                        checked={orderUserIds.includes(admin.id)}
                                                                        onCheckedChange={(checked) => {
                                                                            if (checked) setOrderUserIds([...orderUserIds, admin.id]);
                                                                            else setOrderUserIds(orderUserIds.filter(id => id !== admin.id));
                                                                        }}
                                                                        className="h-5 w-5 rounded-md"
                                                                    />
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3 text-center">
                                                                <div className="flex justify-center">
                                                                    <Checkbox
                                                                        checked={inquiryUserIds.includes(admin.id)}
                                                                        onCheckedChange={(checked) => {
                                                                            if (checked) setInquiryUserIds([...inquiryUserIds, admin.id]);
                                                                            else setInquiryUserIds(inquiryUserIds.filter(id => id !== admin.id));
                                                                        }}
                                                                        className="h-5 w-5 rounded-md"
                                                                    />
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {admins.length === 0 && (
                                                        <tr>
                                                            <td colSpan={3} className="px-4 py-8 text-center text-gray-400 italic">
                                                                {t('settings.noAdminsFound')}
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            {isNotificationSettingsOpen && (<div className="mb-10" />)}

                            <DialogFooter className="mt-10">
                                <Button type="submit" className="w-full h-20 rounded-xl text-base font-bold shadow-lg shadow-primary/20" disabled={isSaving}>
                                    {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : t('settings.submit')}
                                </Button>
                            </DialogFooter>
                        </form>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
