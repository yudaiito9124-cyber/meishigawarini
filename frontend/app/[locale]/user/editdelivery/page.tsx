'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, ChevronDown, Truck } from 'lucide-react';
import { userApi } from '@/lib/api/user';

export default function DeliverySettingsPage() {
    const t = useTranslations('ReceivePage.formStep');
    const tp = useTranslations('UserProfilePage');
    const router = useRouter();

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [name, setName] = useState('');
    const [zip_code, setZipCode] = useState('');
    const [address, setAddress] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const data = await userApi.user_receiver_get({});
                if (data.receiver_info) {
                    setName(data.receiver_info.name || '');
                    setZipCode(data.receiver_info.zip_code || '');
                    setAddress(data.receiver_info.address || '');
                    setPhone(data.receiver_info.phone || '');
                    setEmail(data.receiver_info.email || '');
                }
            } catch (error) {
                console.error("Failed to load receiver info", error);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await userApi.user_receiver_update({
                receiver_info: {
                    name,
                    zip_code,
                    address,
                    phone,
                    email
                }
            });
            alert(tp('deliverySettingsSuccess'));
        } catch (error) {
            console.error("Failed to save receiver info", error);
            alert('Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleZipCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let rawValue = e.target.value;
        let converted = rawValue.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).replace(/[ー‐―－]/g, "-");
        let filtered = converted.replace(/[^0-9-]/g, "");
        const digitsOnly = filtered.replace(/-/g, "");
        if (digitsOnly.length > 7) return;
        setZipCode(filtered);
    };

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let rawValue = e.target.value;
        let converted = rawValue.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).replace(/[ー‐―－]/g, "-");
        let filtered = converted.replace(/[^0-9-]/g, "");
        const digitsOnly = filtered.replace(/-/g, "");
        if (digitsOnly.length > 11) return;
        setPhone(filtered);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center py-12 px-4 text-gray-900 font-sans">
            <div className="w-full max-w-3xl flex justify-start mb-6">
                 <Button 
                    variant="outline" 
                    size="sm" 
                    className="rounded-full bg-white/50 backdrop-blur-sm border-gray-200 text-gray-500 hover:text-gray-900 shadow-sm h-9 px-4"
                    onClick={() => router.push('/user')}
                 >
                    <ChevronDown className="h-4 w-4 mr-1 rotate-90" /> {tp('back')}
                 </Button>
            </div>

            <Card className="w-full max-w-3xl rounded-[2rem] shadow-2xl border-none overflow-hidden bg-white/80 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-500">
                <CardHeader className="bg-gradient-to-r from-rose-500 to-rose-700 p-10 text-white flex flex-col gap-4">
                    <div className="flex flex-row items-center gap-4">
                        <div className="p-3 bg-white/20 rounded-2xl shadow-inner">
                            <Truck className="w-8 h-8 text-white" />
                        </div>
                        <div>
                            <CardTitle className="text-3xl font-black text-white tracking-tight">{tp('deliverySettings')}</CardTitle>
                            <p className="text-rose-100/80 mt-1 font-bold uppercase tracking-widest text-sm">{tp('deliverySettingsDesc')}</p>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-10 space-y-10">
                    <form id="delivery-form" onSubmit={handleSave} className="space-y-10">
                        <div className="space-y-3">
                            <Label htmlFor="name" className="text-xs font-black text-slate-600 uppercase tracking-widest ml-1">{t('name')}</Label>
                            <Input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('name-placeholder')}
                                className="rounded-2xl border-gray-200 focus:ring-rose-500 focus:border-rose-500 h-14 bg-gray-50/50 text-lg shadow-inner"
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-10">
                            <div className="space-y-3">
                                <Label htmlFor="zip_code" className="text-xs font-black text-slate-600 uppercase tracking-widest ml-1">{t('zip_code')}</Label>
                                <Input
                                    id="zip_code"
                                    value={zip_code}
                                    onChange={handleZipCodeChange}
                                    placeholder={t('zip_code-placeholder')}
                                    className="rounded-2xl border-gray-200 focus:ring-rose-500 focus:border-rose-500 h-14 bg-gray-50/50 text-lg shadow-inner"
                                />
                            </div>
                            <div className="space-y-3">
                                <Label htmlFor="phone" className="text-xs font-black text-slate-600 uppercase tracking-widest ml-1">{t('phone')}</Label>
                                <Input
                                    id="phone"
                                    value={phone}
                                    onChange={handlePhoneChange}
                                    placeholder={t('phone-placeholder')}
                                    className="rounded-2xl border-gray-200 focus:ring-rose-500 focus:border-rose-500 h-14 bg-gray-50/50 text-lg shadow-inner"
                                />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <Label htmlFor="address" className="text-xs font-black text-slate-600 uppercase tracking-widest ml-1">{t('address')}</Label>
                            <Input
                                id="address"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                placeholder={t('address-placeholder')}
                                className="rounded-2xl border-gray-200 focus:ring-rose-500 focus:border-rose-500 h-14 bg-gray-50/50 text-lg shadow-inner"
                            />
                        </div>

                        <div className="space-y-3">
                            <Label htmlFor="email" className="text-xs font-black text-slate-600 uppercase tracking-widest ml-1">{t('email')}</Label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder={t('email-placeholder')}
                                className="rounded-2xl border-gray-200 focus:ring-rose-500 focus:border-rose-500 h-14 bg-gray-50/50 text-lg shadow-inner"
                            />
                        </div>
                    </form>
                </CardContent>
                <CardFooter className="bg-slate-50/80 p-10 flex justify-end items-center gap-4">
                    <Button
                        type="submit"
                        form="delivery-form"
                        disabled={saving}
                        className="rounded-full px-10 h-12 bg-rose-600 hover:bg-rose-700 text-white font-black text-lg transition-all shadow-xl hover:shadow-rose-200 active:scale-95 disabled:opacity-50"
                    >
                        {saving ? (
                            <><Loader2 className="w-5 h-5 mr-3 animate-spin" /> {tp('saving')}</>
                        ) : (
                            <><Save className="w-5 h-5 mr-3" /> {tp('save')}</>
                        )}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
