'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, ChevronLeft } from 'lucide-react';
import { userApi } from '@/lib/api/user';

export default function DeliverySettingsPage() {
    const t = useTranslations('ReceivePage.formStep');
    const tp = useTranslations('UserProfilePage');
    const router = useRouter();

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [name, setName] = useState('');
    const [zipCode, setZipCode] = useState('');
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
                    setZipCode(data.receiver_info.zipCode || '');
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
                    zipCode,
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
        <div className="min-h-screen bg-mist-50 py-12 px-4 shadow-[inset_0_0_100px_rgba(0,0,0,0.05)]">
            <div className="max-w-2xl mx-auto space-y-6">
                <Button variant="ghost" className="mb-4 text-mist-600 hover:text-mist-900 transition-colors" onClick={() => router.push('/user')}>
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    {tp('back')}
                </Button>

                <Card className="rounded-[2.5rem] shadow-2xl border-none overflow-hidden bg-white/80 backdrop-blur-xl">
                    <CardHeader className="bg-gradient-to-br from-rose-50 to-white border-b border-rose-100/50 p-10">
                        <CardTitle className="text-3xl font-black text-gray-800 tracking-tight">{tp('deliverySettings')}</CardTitle>
                        <p className="text-gray-500 mt-2 font-medium">{tp('deliverySettingsDesc')}</p>
                    </CardHeader>
                    <CardContent className="p-10 space-y-8">
                        <form id="delivery-form" onSubmit={handleSave} className="space-y-8">
                            <div className="space-y-3">
                                <Label htmlFor="name" className="text-sm font-bold text-gray-700 ml-1">{t('name')}</Label>
                                <Input
                                    id="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder={t('name-placeholder')}
                                    className="rounded-2xl border-gray-200 focus:ring-rose-500 focus:border-rose-500 h-14 bg-gray-50/50 text-lg"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                                <div className="space-y-3">
                                    <Label htmlFor="zipCode" className="text-sm font-bold text-gray-700 ml-1">{t('zipCode')}</Label>
                                    <Input
                                        id="zipCode"
                                        value={zipCode}
                                        onChange={handleZipCodeChange}
                                        placeholder={t('zipCode-placeholder')}
                                        className="rounded-2xl border-gray-200 focus:ring-rose-500 focus:border-rose-500 h-14 bg-gray-50/50 text-lg"
                                    />
                                </div>
                                <div className="space-y-3">
                                    <Label htmlFor="phone" className="text-sm font-bold text-gray-700 ml-1">{t('phone')}</Label>
                                    <Input
                                        id="phone"
                                        value={phone}
                                        onChange={handlePhoneChange}
                                        placeholder={t('phone-placeholder')}
                                        className="rounded-2xl border-gray-200 focus:ring-rose-500 focus:border-rose-500 h-14 bg-gray-50/50 text-lg"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <Label htmlFor="address" className="text-sm font-bold text-gray-700 ml-1">{t('address')}</Label>
                                <Input
                                    id="address"
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value)}
                                    placeholder={t('address-placeholder')}
                                    className="rounded-2xl border-gray-200 focus:ring-rose-500 focus:border-rose-500 h-14 bg-gray-50/50 text-lg"
                                />
                            </div>

                            <div className="space-y-3">
                                <Label htmlFor="email" className="text-sm font-bold text-gray-700 ml-1">{t('email')}</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder={t('email-placeholder')}
                                    className="rounded-2xl border-gray-200 focus:ring-rose-500 focus:border-rose-500 h-14 bg-gray-50/50 text-lg"
                                />
                            </div>
                        </form>
                    </CardContent>
                    <CardFooter className="bg-gray-50/80 p-10 flex justify-end items-center gap-4">
                        <Button
                            type="submit"
                            form="delivery-form"
                            disabled={saving}
                            className="rounded-full px-12 py-7 bg-rose-600 hover:bg-rose-700 text-white font-black text-xl transition-all shadow-xl hover:shadow-rose-200 active:scale-95 disabled:opacity-50 h-10"
                        >
                            {saving ? (
                                <><Loader2 className="w-6 h-6 mr-3 animate-spin" /> 保存中...</>
                            ) : (
                                <><Save className="w-6 h-6 mr-3" /> {tp('save')}</>
                            )}
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
}
