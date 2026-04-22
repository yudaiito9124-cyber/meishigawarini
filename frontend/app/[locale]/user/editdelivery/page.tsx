/**
 * ファイル概要: 配送先情報設定ページ (Delivery Settings)
 * 
 * 役割:
 * ユーザーがギフトを受け取る際のデフォルトの配送先情報（氏名、住所、電話番号等）を
 * 事前に登録・編集するための画面です。
 * 
 * 主要機能:
 * 1. 登録済み配送先情報の取得とフォームへの初期値反映。
 * 2. 入力バリデーション（郵便番号、電話番号、メールアドレスの一致確認）。
 * 3. 入力補助（全角数字の半角変換など）。
 * 4. 配送先情報の更新保存。
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, ChevronDown, Truck } from 'lucide-react';
import { userApi } from '@/lib/api/user';
import { sanitizePhoneForInput, sanitizeZipForInput, isValidZip, isValidPhone, isValidEmail } from '@/lib/validation/contact';

/**
 * 配送先設定ページコンポーネント
 */
export default function DeliverySettingsPage() {
    /** 受取・配送関連の翻訳 namespace: ReceivePage.formStep */
    const t = useTranslations('ReceivePage.formStep');
    /** エラーメッセージ関連の翻訳 namespace: ReceivePage.errors */
    const te = useTranslations('ReceivePage.errors');
    /** ユーザープロファイル全般の翻訳 namespace: UserProfilePage */
    const tp = useTranslations('UserProfilePage');
    /** ルーター */
    const router = useRouter();

    /** データ初期読み込み中フラグ */
    const [loading, setLoading] = useState(false);
    /** 保存処理中フラグ */
    const [saving, setSaving] = useState(false);
    
    // --- フォームステート ---
    /** 氏名 */
    const [name, setName] = useState('');
    /** 郵便番号 */
    const [zip_code, setZipCode] = useState('');
    /** 住所 */
    const [address, setAddress] = useState('');
    /** 電話番号 */
    const [phone, setPhone] = useState('');
    /** メールアドレス */
    const [email, setEmail] = useState('');
    /** 確認用メールアドレス */
    const [email2, setEmail2] = useState('');
    
    /** 背景同期用のコンテナ参照 */
    const containerRef = useRef<HTMLDivElement>(null);

    /**
     * 初回レンダリング時にバックエンドから現在の配送先情報を取得します。
     */
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
                    setEmail2(data.receiver_info.email || '');
                }
            } catch (error) {
                console.error("Failed to load receiver info", error);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    /**
     * ページ背景色とbody/htmlの背景色を同期させます。
     */
    useEffect(() => {
        const body = document.body;
        const html = document.documentElement;

        const updateStyles = () => {
            if (!containerRef.current) return;
            const style = window.getComputedStyle(containerRef.current);
            body.style.backgroundColor = style.backgroundColor;
            html.style.backgroundColor = style.backgroundColor;
        };

        updateStyles();
        const timer = setTimeout(updateStyles, 100);

        return () => {
            clearTimeout(timer);
            body.style.backgroundColor = "";
            html.style.backgroundColor = "";
        };
    }, [loading]);

    /**
     * 保存ボタンクリック時のイベントハンドラ
     * フォームのバリデーションチェック後、APIを介して情報を更新します。
     */
    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();

        const form = e.currentTarget as HTMLFormElement;

        // HTML5 標準のバリデーションチェック
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        if (!isValidZip(zip_code)) {
            alert(te('invalidZip'));
            return;
        }

        if (!isValidPhone(phone)) {
            alert(te('invalidPhone'));
            return;
        }

        // メールアドレス形式チェック
        if (email && !isValidEmail(email)) {
            alert(te('invalidEmail'));
            return;
        }

        // メールアドレス一致確認
        if (email && email !== email2) {
            alert(t('email-mismatch-error'));
            return;
        }

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
        } catch (error: any) {
            console.error("Failed to save receiver info", error);
            alert(error.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    /**
     * 郵便番号入力時の自動フォーマット処理。
     * 全角の半角変換、数字とハイフン以外の除去、桁数制限を行います。
     */
    const handleZipCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setZipCode(sanitizeZipForInput(e.target.value, zip_code));
    };

    /**
     * 電話番号入力時の自動フォーマット処理。
     * 全角の半角変換、数字とハイフン以外の除去、桁数制限を行います。
     */
    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPhone(sanitizePhoneForInput(e.target.value, phone));
    };

    if (loading) {
        return (
            <div ref={containerRef} className="flex items-center justify-center min-h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
        );
    }

    return (
        <div ref={containerRef} className="min-h-screen bg-slate-50 flex flex-col items-center py-12 px-4 text-gray-900 font-sans">
            {/* ナビゲーション（ダッシュボードへ戻る） */}
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
                        {/* 氏名 */}
                        <div className="space-y-3">
                            <Label htmlFor="name" className="text-md font-black text-slate-600 uppercase tracking-widest ml-1">{t('name')}</Label>
                            <Input
                                id="name"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('name-placeholder')}
                                className="rounded-2xl border-gray-200 focus:ring-rose-500 focus:border-rose-500 h-14 bg-gray-50/50 text-lg shadow-inner"
                            />
                        </div>

                        {/* 郵便番号 */}
                        <div className="space-y-3">
                            <Label htmlFor="zip_code" className="text-md font-black text-slate-600 uppercase tracking-widest ml-1">{t('zip_code')}</Label>
                            <Input
                                id="zip_code"
                                required
                                value={zip_code}
                                pattern="^(?=([^0-9]*[0-9]){7}[^0-9]*$)[0-9\-]*$"
                                onChange={handleZipCodeChange}
                                placeholder={t('zip_code-placeholder')}
                                className="rounded-2xl border-gray-200 focus:ring-rose-500 focus:border-rose-500 h-14 bg-gray-50/50 text-lg shadow-inner"
                            />
                        </div>

                        {/* 住所 */}
                        <div className="space-y-3">
                            <Label htmlFor="address" className="text-md font-black text-slate-600 uppercase tracking-widest ml-1">{t('address')}</Label>
                            <Input
                                id="address"
                                required
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                placeholder={t('address-placeholder')}
                                className="rounded-2xl border-gray-200 focus:ring-rose-500 focus:border-rose-500 h-14 bg-gray-50/50 text-lg shadow-inner"
                            />
                        </div>

                        {/* 電話番号 */}
                        <div className="space-y-3">
                            <Label htmlFor="phone" className="text-md font-black text-slate-600 uppercase tracking-widest ml-1">{t('phone')}</Label>
                            <Input
                                id="phone"
                                required
                                type="tel"
                                value={phone}
                                pattern="^(?=([^0-9]*[0-9]){10,11}[^0-9]*$)[0-9\-]*$"
                                onChange={handlePhoneChange}
                                placeholder={t('phone-placeholder')}
                                className="rounded-2xl border-gray-200 focus:ring-rose-500 focus:border-rose-500 h-14 bg-gray-50/50 text-lg shadow-inner"
                            />
                        </div>

                        {/* メールアドレス（通知用） */}
                        <div className="space-y-3">
                            <Label htmlFor="email" className="text-md font-black text-slate-600 uppercase tracking-widest ml-1">{t('email')}</Label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder={t('email-placeholder')}
                                className="rounded-2xl border-gray-200 focus:ring-rose-500 focus:border-rose-500 h-14 bg-gray-50/50 text-lg shadow-inner"
                            />
                            {/* 確認用（入力時のみ表示） */}
                            {email && (
                                <div className="space-y-3 mt-4 animate-in fade-in slide-in-from-top-2">
                                    <Input
                                        id="email2"
                                        type="email"
                                        required
                                        value={email2}
                                        onPaste={(e) => e.preventDefault()}
                                        onChange={(e) => setEmail2(e.target.value)}
                                        pattern={email ? email.replace(/[.*+?^${}()|[\]\\/\-]/g, '\\$&') : undefined}
                                        title={t('email-mismatch-error')}
                                        placeholder={t('email-confirm-placeholder')}
                                        className="rounded-2xl border-gray-200 focus:ring-rose-500 focus:border-rose-500 h-14 bg-gray-50/50 text-lg shadow-inner"
                                    />
                                </div>
                            )}
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
