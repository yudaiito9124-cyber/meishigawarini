"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Card, CardContent, CardTitle, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, X, Globe, Copy, Trash2, SendHorizontal, Pencil, User, Image as ImageIcon, FileIcon, ChevronDown } from "lucide-react";
import { SiX, SiInstagram, SiYoutube, SiFacebook, SiLine, SiTiktok, SiThreads, SiLinktree, SiEight } from '@icons-pack/react-simple-icons';
import { cn } from "@/lib/utils";
import SandboxedHtml from "@/components/SandboxedHtml";
import { userApi } from "@/lib/api/user";

const SENDER_FORM_KEYS = [
    "name", "job_title", "company", "department", "email", "phone", "phone_direct",
    "address", "HP", "memo", "SNS_Facebook", "SNS_Instagram", "SNS_Threads",
    "SNS_X", "SNS_YouTube", "SNS_LINE", "SNS_TikTok", "Service_Eight", "Service_Linktree"
];

// image resizing utility
function resizeImage(file: File, maxWidth = 1000): Promise<File | Blob> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            if (img.width <= maxWidth) return resolve(file);
            const scale = maxWidth / img.width;
            const canvas = document.createElement('canvas');
            canvas.width = maxWidth;
            canvas.height = img.height * scale;
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(file);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
                if (blob) resolve(new File([blob], file.name, { type: file.type }));
                else resolve(file);
            }, file.type);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

export default function UserProfilePage() {
    const t = useTranslations('ReceivePage');
    const tUser = useTranslations('UserProfilePage');
    const params = useParams();
    const userid = params?.userid as string;

    const [loading, setLoading] = useState(true);
    const [senderInfo, setSenderInfo] = useState<any>(null);
    const [senderForm, setSenderForm] = useState<any>({});
    const [isEditingSender, setIsEditingSender] = useState(false);
    const [senderInfoLoading, setSenderInfoLoading] = useState(false);
    const [showDetailHtmlSection, setShowDetailHtmlSection] = useState(false);
    const [htmlImageUrls, setHtmlImageUrls] = useState<string[]>([]);
    const [deletedHtmlUrls, setDeletedHtmlUrls] = useState<string[]>([]);

    const fetchSenderInfo = useCallback(async () => {
        setLoading(true);
        try {
            const data = await userApi.user_profile_get({});
            if (data && data.profile) {
                setSenderInfo(data.profile);
                setSenderForm(data.profile);
                const htmlUrls = data.profile.html_image_urls || [];
                setHtmlImageUrls(htmlUrls);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSenderInfo();
    }, [fetchSenderInfo]);

    const updateSenderForm = (field: string, value: string) => {
        setSenderForm((prev: any) => ({ ...prev, [field]: value }));
    };

    const handleSenderInfoUpdate = async () => {
        setSenderInfoLoading(true);
        try {
            const updatedSenderInfo = {
                ...senderInfo,
                ...senderForm,
                html_image_urls: htmlImageUrls
            };

            await userApi.user_profile_update({
                profile: updatedSenderInfo,
                deleted_html_image_urls: deletedHtmlUrls
            });

            setSenderInfo(updatedSenderInfo);
            setDeletedHtmlUrls([]);
            setIsEditingSender(false);
        } catch (e: any) {
            alert(t('senderInfo.updateFailed') + (e.message || ""));
        } finally {
            setSenderInfoLoading(false);
        }
    };

    const handleSenderCardUpload = async (file: File) => {
        setSenderInfoLoading(true);
        try {
            let uploadFile: File | Blob = file;
            if (file.type.startsWith("image/")) {
                try {
                    uploadFile = await resizeImage(file);
                } catch (err) {}
            }

            const { uploadUrl, publicUrl } = await userApi.user_profile_uploadurl({
                filename: file.name,
                contentType: uploadFile.type
            });

            const res = await fetch(uploadUrl, {
                method: "PUT",
                body: uploadFile,
                headers: { "Content-Type": file.type }
            });

            if (!res.ok) throw new Error("Upload failed");

            setSenderForm((prev: any) => ({
                ...prev,
                card_image_url: publicUrl,
                card_image_name: file.name
            }));
        } catch (e: any) {
            alert(t('errors.uploadFailed'));
        } finally {
            setSenderInfoLoading(false);
        }
    };

    const handleHtmlImageUpload = async (file: File) => {
        setSenderInfoLoading(true);
        try {
            let uploadFile: File | Blob = file;
            if (file.type.startsWith("image/")) {
                try {
                    uploadFile = await resizeImage(file);
                } catch (err) {}
            }

            const { uploadUrl, publicUrl } = await userApi.user_profile_uploadurl({
                filename: file.name,
                contentType: file.type
            });

            const res = await fetch(uploadUrl, {
                method: "PUT",
                body: uploadFile,
                headers: { "Content-Type": file.type }
            });

            if (!res.ok) throw new Error("Upload failed");

            const next = [...htmlImageUrls, publicUrl];
            setHtmlImageUrls(next);
            setSenderForm((prev: any) => ({
                ...prev,
                html_image_urls: next
            }));
        } catch (e: any) {
            alert(t('errors.uploadFailed'));
        } finally {
            setSenderInfoLoading(false);
        }
    };

    const handleRemoveSenderImage = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setSenderForm((prev: any) => ({
            ...prev,
            card_image_url: "",
            card_image_name: ""
        }));
    };

    const handleRemoveHtmlImage = (url: string) => {
        if (!confirm(t('senderInfo.confirmRemoveImage'))) return;
        const next = htmlImageUrls.filter(u => u !== url);
        setHtmlImageUrls(next);
        setDeletedHtmlUrls(prev => [...prev, url]);
        setSenderForm((prev: any) => ({
            ...prev,
            html_image_urls: next
        }));
    };

    const EmptySenderInfoWithLinks = (info: any) => {
        return !info || Object.keys(info).every(key => {
            if (key.startsWith("ts_")) return true;
            if (key === "html_image_urls") return true;
            if (!key.startsWith("Service_") && !key.startsWith("SNS_")) return true;
            return !info[key];
        });
    };

    const renderTextWithLinks = (text: string) => {
        if (!text) return text;
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return text.split(urlRegex).map((part, i) => {
            if (part.match(urlRegex)) {
                return (
                    <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
                        {part}
                    </a>
                );
            }
            return part;
        });
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4">
            <div className="w-full max-w-xl flex justify-start mb-4">
                 <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-gray-500 hover:text-gray-800 -ml-2 h-8"
                    onClick={() => window.location.href = `/user/${userid}`}
                 >
                    <ChevronDown className="h-4 w-4 mr-1 rotate-90" /> {tUser('back')}
                 </Button>
            </div>

            <Card className="w-full max-w-xl flex flex-col mt-2 shadow-xl border-none rounded-2xl overflow-hidden bg-white">
                <CardHeader className="flex flex-row justify-between items-center bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-6 rounded-t-2xl">
                    <CardTitle className="text-xl text-center flex items-center justify-left gap-2 text-white">
                        <User className="w-5 h-5 text-white" />
                        {t('senderInfo.title')}
                    </CardTitle>
                    <div className="flex flex-row items-center">
                        {(senderInfo && senderInfo.ts_updated_at) && (
                            <span className="text-[10px] text-blue-100 flex items-center mr-2">
                                {new Date(senderInfo.ts_updated_at).toLocaleString()} {t('senderInfo.updated')}
                            </span>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 text-white hover:bg-white/20 hover:text-white"
                            onClick={() => setIsEditingSender(!isEditingSender)}
                        >
                            {isEditingSender ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="min-h-0 flex flex-col animate-in fade-in slide-in-from-bottom-2 relative group/card p-0">
                    
                    {/* 編集箇所 (ReceivePageと完全一致) */}
                    {isEditingSender ? (
                        <div className="space-y-6 p-6">
                            <div className="w-full flex items-center justify-center text-xs text-center text-gray-500">
                                {t('senderInfo.description')}
                            </div>
                            <div
                                className="aspect-[1.6/1] w-full flex flex-col items-center justify-center gap-3 cursor-pointer p-6 border rounded-xl bg-gray-50/50 hover:bg-white transition-colors"
                                onClick={() => document.getElementById('senderCardUpload')?.click()}
                            >
                                {senderForm?.card_image_url && (
                                    <div className="relative w-full h-full">
                                        <img
                                            src={senderForm.card_image_url}
                                            alt="Business Card"
                                            className="w-full h-full object-contain rounded-lg shadow-md bg-white ring-1 ring-black/5"
                                        />
                                        <Button
                                            variant="destructive"
                                            size="icon"
                                            className="absolute -top-2 -right-2 h-8 w-8 rounded-full shadow-lg z-10"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleRemoveSenderImage();
                                            }}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                )}
                                <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center group-hover/card:scale-110 transition-transform">
                                    <FileIcon className="w-8 h-8 text-blue-500" />
                                </div>
                                <div className="text-center">
                                    <p className="font-semibold text-gray-800">{t('senderInfo.uploadPlaceholder')}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-6">
                                {SENDER_FORM_KEYS.map((field) => (
                                    field !== 'card_image_url' && field !== 'card_image_name' && field !== 'ts_updated_at' && field !== 'ts_created_at' && field !== `html_image_urls` && field !== `detail_html` && field !== 'import_id' && field !== 'sender_id' && (
                                        <div key={field} className={cn("space-y-1.5", (field === 'memo' || field === 'address' || field === 'detail_html') && "md:col-span-2")}>
                                            <Label htmlFor={`sender-${field}`} className="text-xs font-bold text-gray-600 flex items-center gap-1">
                                                {field === "SNS_X" ? <SiX size={14} color="default" /> :
                                                    field === "SNS_Instagram" ? <SiInstagram size={14} color="default" /> :
                                                        field === "SNS_YouTube" ? <SiYoutube size={14} color="default" /> :
                                                            field === "SNS_Facebook" ? <SiFacebook size={14} color="default" /> :
                                                                field === "SNS_LINE" ? <SiLine size={14} color="default" /> :
                                                                    field === "SNS_TikTok" ? <SiTiktok size={14} color="default" /> :
                                                                        field === "SNS_Threads" ? <SiThreads size={14} color="default" /> :
                                                                            field === "Service_Linktree" ? <SiLinktree size={14} color="default" /> :
                                                                                field === "Service_Eight" ? <SiEight size={14} color="default" /> :
                                                                                    (field.startsWith("SNS_") || field.startsWith("Service_") || field === "HP" || field === "url") ? <Globe size={14} /> :
                                                                                        null
                                                }
                                                {t(`senderInfo.labels.${field}`)}
                                            </Label>
                                            {field === 'memo' || field === 'address' ? (
                                                <Textarea
                                                    id={`sender-${field}`}
                                                    value={senderForm[field] || ""}
                                                    onChange={(e) => updateSenderForm(field, e.target.value)}
                                                    disabled={senderInfoLoading}
                                                    className="min-h-[80px] text-sm"
                                                    placeholder={t(`senderInfo.labels.${field}`)}
                                                />
                                            ) : (
                                                <Input
                                                    id={`sender-${field}`}
                                                    value={senderForm[field] || ""}
                                                    onChange={(e) => updateSenderForm(field, e.target.value)}
                                                    disabled={senderInfoLoading}
                                                    className="h-9 text-sm"
                                                    placeholder={t(`senderInfo.labels.${field}`)}
                                                    type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
                                                />
                                            )}
                                        </div>
                                    )
                                ))}

                                <div className="md:col-span-2 mt-4 flex justify-center pb-0">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="text-xs text-gray-500 hover:text-blue-600 gap-2 px-4 h-8"
                                        onClick={() => setShowDetailHtmlSection(!showDetailHtmlSection)}
                                    >
                                        <Plus className={cn("w-3.5 h-3.5 transition-transform duration-200", showDetailHtmlSection && "rotate-180")} />
                                        {t(`senderInfo.labels.addhtmlmessage`)}
                                    </Button>
                                </div>

                                {showDetailHtmlSection && (
                                    <div className="md:col-span-2 flex flex-col px-6 space-y-4 p-2 pt-0 border rounded-xl shadow">
                                        {/* HTML Section */}
                                        <div className="flex items-center justify-between mt-8">
                                            <Label htmlFor={`sender-detail_html`} className="text-xs font-bold text-gray-600 flex items-center">
                                                {t(`senderInfo.labels.detail_html`)}
                                            </Label>
                                        </div>
                                        <div className="md:col-span-2 flex flex-col w-full items-center gap-2 space-y-1.5 p-0 mb-3">
                                            <div className="md:col-span-1 w-full flex flex-col px-6 space-y-1 p-0 pr-0 pl-0">
                                                <Textarea
                                                    id={`sender-detail_html`}
                                                    value={senderForm["detail_html"] || ""}
                                                    onChange={(e) => updateSenderForm("detail_html", e.target.value)}
                                                    disabled={senderInfoLoading}
                                                    className="min-h-[80px] text-sm font-mono"
                                                    placeholder={t(`senderInfo.labels.detail_html-placeholder`)}
                                                />
                                            </div>

                                            {/* HTML Images Section */}
                                            <div className="md:col-span-1 flex flex-col px-6 space-y-1 p-0 pr-0 pl-0 mt-4 w-full">
                                                <div className="flex items-center justify-center">
                                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                                        <ImageIcon className="w-3 h-3 text-blue-500" />
                                                        {t(`senderInfo.labels.detail_html-images`)}
                                                    </span>
                                                </div>
                                                <div className="space-y-2">
                                                    {htmlImageUrls.length === 0 ? (
                                                        <p className="text-[10px] text-gray-400 italic font-medium py-2 text-center">{t('senderInfo.labels.detail_html-noimages')}</p>
                                                    ) : (
                                                        <div className="grid grid-cols-1 gap-2">
                                                            {htmlImageUrls.map((url, idx) => (
                                                                <div key={idx} className="flex items-center gap-3 p-2 bg-gray-50 rounded-md border border-gray-100 group hover:border-blue-200 transition-colors">
                                                                    <div className="w-10 h-10 rounded-md border bg-white overflow-hidden shrink-0 shadow-sm ring-1 ring-black/5">
                                                                        <img src={url} alt="HTML Asset" className="w-full h-full object-cover" onError={(e) => { (e.target as any).src = 'https://placehold.co/100x100?text=Error'; }} />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-[10px] font-mono text-gray-400 truncate select-all">{url}</p>
                                                                    </div>
                                                                    <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="h-8 w-8 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                                                                            onClick={() => {
                                                                                navigator.clipboard.writeText(url);
                                                                                alert(t('senderInfo.urlCopied'));
                                                                            }}
                                                                        >
                                                                            <Copy className="w-3.5 h-3.5" />
                                                                        </Button>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50"
                                                                            onClick={() => handleRemoveHtmlImage(url)}
                                                                        >
                                                                            <Trash2 className="w-3.5 h-3.5" />
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 text-[10px] gap-1 px-2 border-dashed bg-blue-50/50 hover:bg-blue-50 text-blue-600 border-blue-200 w-full mt-2"
                                                    onClick={() => (document.getElementById('htmlImageUpload') as HTMLInputElement)?.click()}
                                                >
                                                    <Plus className="w-3 h-3" />
                                                    {t(`senderInfo.labels.detail_html-addimage`)}
                                                </Button>
                                                <div className="bg-blue-50/50 p-2.5 rounded-lg border border-blue-100/50 mt-2">
                                                    <p className="text-[9px] text-blue-700 leading-relaxed font-medium">
                                                        <span className="inline-block px-1 bg-blue-100 rounded mr-1 text-blue-800">{t('senderInfo.usage')}</span>
                                                        {t('senderInfo.usageDesc1')} <code>&lt;img src="..."&gt;</code> {t('senderInfo.usageDesc2')}
                                                    </p>
                                                </div>
                                            </div>
                                            <input
                                                type="file"
                                                id="htmlImageUpload"
                                                className="hidden"
                                                accept="image/*"
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) handleHtmlImageUpload(file);
                                                    e.target.value = "";
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="md:col-span-2 flex flex-col gap-2 pt-5 ">
                                    <Button
                                        onClick={() => handleSenderInfoUpdate()}
                                        disabled={senderInfoLoading}
                                        className="w-full"
                                    >
                                        {senderInfoLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <SendHorizontal className="w-4 h-4 mr-2" />}
                                        {senderInfoLoading ? t('senderInfo.saving') : t('senderInfo.save')}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => setIsEditingSender(false)}
                                    >
                                        {t('senderInfo.cancel')}
                                    </Button>
                                </div>
                            </div>
                            <div className="mt-20 border-b" />
                            <Label className="w-full flex flex-col text-center text-xl border border-blue-100 border-3 border-dashed rounded-xl py-4">{t('senderInfo.preview')}</Label>
                        </div>
                    ) : null}

                    {/* プレビュー表示セクション (ReceivePageと完全一致) */}
                    {senderInfo ? (
                        <div className="w-full pt-6">
                            {/* HTML Detail */}
                            {senderInfo.detail_html && (
                                <CardContent className="min-h-0 flex flex-1 w-full mb-6">
                                    <div className="w-full mt-0 relative rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-white">
                                        <SandboxedHtml html={senderInfo.detail_html} />
                                        <div className="absolute inset-0 pointer-events-none rounded-2xl ring-1 ring-black/5 ring-inset" />
                                    </div>
                                </CardContent>
                            )}

                            <div className="mr-8 ml-8">
                                {/* 名刺画像 */}
                                {senderInfo.card_image_url && (
                                    <div className="w-full mb-6">
                                        <img
                                            src={senderInfo.card_image_url}
                                            alt="Business Card"
                                            className="w-full h-full object-contain rounded-lg shadow-md bg-white ring-1 ring-black/5 border"
                                        />
                                    </div>
                                )}
                                {/* 名前 */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 ml-6 mr-6 mb-2">
                                    {SENDER_FORM_KEYS.map((field) => {
                                        const value = senderForm[field];
                                        if (value && field === "name") {
                                            return (
                                                <div key={field} className={cn("flex flex-col border-b border-gray-50 pb-2 sm:col-span-2")}>
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase">
                                                        {t(`senderInfo.labels.${field}`)}
                                                    </span>
                                                    <span className="text-gray-800 break-words whitespace-pre-wrap text-xl font-bold">
                                                        {value}
                                                    </span>
                                                </div>
                                            );
                                        }
                                        return null;
                                    })}
                                </div>
                                {/* その他の情報 */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 ml-6 mr-6">
                                    {SENDER_FORM_KEYS.map((field) => {
                                        const value = senderForm[field];
                                        if (value &&
                                            field !== 'card_image_url' && field !== 'card_image_name' &&
                                            field !== 'ts_updated_at' && field !== 'ts_created_at' &&
                                            field !== 'name' && field !== 'detail_html' &&
                                            field !== 'import_id' && field !== 'sender_id' &&
                                            field !== 'html_image_urls' && typeof value === 'string' &&
                                            !field.startsWith("SNS_") && !field.startsWith("Service_")) {
                                                return (
                                                    <div key={field} className={cn("flex flex-col border-b border-gray-50 pb-2 mb-2", (field === 'memo' || field === 'address') && "sm:col-span-2")}>
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase">
                                                            {t(`senderInfo.labels.${field}`)}
                                                        </span>
                                                        <span className={cn("text-gray-800 break-words", (field === 'memo' || field === 'address') && "whitespace-pre-wrap text-sm")}>
                                                            {field === 'HP' || field === 'memo' ? renderTextWithLinks(value) : value}
                                                        </span>
                                                    </div>
                                                );
                                        }
                                        return null;
                                    })}
                                </div>

                                {/* LINK (SNS/Webサービス) */}
                                {!EmptySenderInfoWithLinks(senderInfo) && (
                                    <div className="gap-1 ml-6 mr-6 pt-4 pb-8">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase mb-2 block">
                                            LINK
                                        </span>
                                        <div className="flex flex-wrap gap-2">
                                            {SENDER_FORM_KEYS.map((field) => {
                                                const value = senderForm[field];
                                                if (value && (field.startsWith("SNS_") || field.startsWith("Service_"))) {
                                                    return (
                                                        <Button
                                                            key={field}
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-8 gap-2 bg-white hover:bg-gray-50 border-gray-200 text-gray-700 relative group"
                                                            onClick={() => {
                                                                if (typeof value === 'string') {
                                                                    const url = value.startsWith('http') ? value : `https://${value}`;
                                                                    window.open(url, '_blank', 'noopener,noreferrer');
                                                                }
                                                            }}
                                                        >
                                                            {field === "SNS_X" ? <SiX size={14} color="default" /> :
                                                                field === "SNS_Instagram" ? <SiInstagram size={14} color="default" /> :
                                                                    field === "SNS_YouTube" ? <SiYoutube size={14} color="default" /> :
                                                                        field === "SNS_Facebook" ? <SiFacebook size={14} color="default" /> :
                                                                            field === "SNS_LINE" ? <SiLine size={14} color="default" /> :
                                                                                field === "SNS_TikTok" ? <SiTiktok size={14} color="default" /> :
                                                                                    field === "SNS_Threads" ? <SiThreads size={14} color="default" /> :
                                                                                        field === "Service_Eight" ? <SiEight size={14} color="default" /> :
                                                                                            field === "Service_Linktree" ? <SiLinktree size={14} color="default" /> :
                                                                                                <Globe size={14} />
                                                            }
                                                            <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-sm z-50">
                                                                {t(`senderInfo.labels.${field}`)}
                                                                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-800 rotate-45" />
                                                            </span>
                                                        </Button>
                                                    );
                                                }
                                                return null;
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : null}

                    {senderInfoLoading && (
                        <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-10 transition-all">
                            <div className="flex flex-col items-center gap-2">
                                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                                <p className="text-xs font-bold text-blue-800">{t('senderInfo.uploading')}</p>
                            </div>
                        </div>
                    )}

                    <input
                        type="file"
                        id="senderCardUpload"
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleSenderCardUpload(file);
                            e.target.value = "";
                        }}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
