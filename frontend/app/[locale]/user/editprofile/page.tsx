"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardTitle, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, X, Globe, Copy, Trash2, SendHorizontal, Pencil, User, Image as ImageIcon, FileIcon, ChevronDown, Sparkles } from "lucide-react";
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
    const router = useRouter();

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

            const result = await userApi.user_profile_update({
                profile: updatedSenderInfo,
                deleted_html_image_urls: deletedHtmlUrls
            });

            if (result && result.profile) {
                setSenderInfo(result.profile);
                setSenderForm(result.profile);
                setHtmlImageUrls(result.profile.html_image_urls || []);
            } else {
                setSenderInfo(updatedSenderInfo);
            }
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
            // Instant local preview
            const localPreviewUrl = URL.createObjectURL(file);
            setSenderForm((prev: any) => ({
                ...prev,
                card_image_url: localPreviewUrl,
            }));

            let uploadFile: File | Blob = file;
            if (file.type.startsWith("image/")) {
                try {
                    uploadFile = await resizeImage(file);
                } catch (err) {}
            }

            const { uploadUrl, publicUrl } = await userApi.user_profile_uploadurl({
                filename: file.name,
                content_type: uploadFile.type
            });

            const res = await fetch(uploadUrl, {
                method: "PUT",
                body: uploadFile,
                headers: { "Content-Type": file.type }
            });

            if (!res.ok) throw new Error("Upload failed");

            // After upload, we have the S3 URL (signed by the backend).
            // We update the state so when it saves, the S3 URL is stored.
            setSenderForm((prev: any) => ({
                ...prev,
                card_image_url: publicUrl,
                card_image_name: file.name
            }));
            setSenderInfoLoading(false);
        } catch (e: any) {
            alert(t('errors.uploadFailed'));
        } finally {
            setSenderInfoLoading(false);
        }
    };

    const handleHtmlImageUpload = async (file: File) => {
        setSenderInfoLoading(true);
        try {
            // Local preview isn't worth it here as it's an array and needs S3 URL for HTML mapping.
            // But let's at least show something.
            let uploadFile: File | Blob = file;
            if (file.type.startsWith("image/")) {
                try {
                    uploadFile = await resizeImage(file);
                } catch (err) {}
            }

            const { uploadUrl, publicUrl } = await userApi.user_profile_uploadurl({
                filename: file.name,
                content_type: file.type
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
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center py-12 px-4 font-sans">
            <div className="w-full max-w-xl flex justify-start mb-6">
                 <Button 
                    variant="outline" 
                    size="sm" 
                    className="rounded-full bg-white/50 backdrop-blur-sm border-gray-200 text-gray-500 hover:text-gray-900 shadow-sm h-9 px-4"
                    onClick={() => router.push('/user')}
                 >
                    <ChevronDown className="h-4 w-4 mr-1 rotate-90" /> {tUser('back')}
                 </Button>
            </div>

            <Card className="w-full max-w-xl flex flex-col mt-2 shadow-2xl border-none rounded-[2rem] overflow-hidden bg-white/80 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-500">
                <CardHeader className="flex flex-row justify-between items-center bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-8">
                    <CardTitle className="text-2xl font-black tracking-tight text-center flex items-center justify-left gap-3 text-white">
                        <div className="p-2 bg-white/20 rounded-xl">
                            <User className="w-6 h-6 text-white" />
                        </div>
                        {t('senderInfo.title')}
                    </CardTitle>
                    <div className="flex flex-row items-center gap-3">
                        {(senderInfo && senderInfo.ts_updated_at) && (
                            <span className="text-[10px] text-blue-100 font-bold uppercase tracking-widest hidden sm:block">
                                {new Date(senderInfo.ts_updated_at).toLocaleDateString()} {t('senderInfo.updated')}
                            </span>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 text-white hover:bg-white/20 rounded-full"
                            onClick={() => setIsEditingSender(!isEditingSender)}
                        >
                            {isEditingSender ? <X className="h-5 w-5" /> : <Pencil className="h-5 w-5" />}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="min-h-0 flex flex-col animate-in fade-in slide-in-from-bottom-2 relative group/card p-0">
                    
                    {/* 編集箇所 (ReceivePageと完全一致) */}
                    {isEditingSender ? (
                        <div className="space-y-8 p-8 animate-in slide-in-from-top-4 duration-500">
                            <div className="w-full flex items-center justify-center text-xs text-center text-gray-400 font-bold uppercase tracking-widest bg-slate-50 py-3 rounded-xl border border-slate-100">
                                {t('senderInfo.description')}
                            </div>
                            <div
                                className="aspect-[1.6/1] w-full flex flex-col items-center justify-center gap-4 cursor-pointer p-8 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50 hover:bg-white hover:border-blue-400 hover:shadow-xl transition-all group/upload"
                                onClick={() => document.getElementById('senderCardUpload')?.click()}
                            >
                                {senderForm?.card_image_url ? (
                                    <div className="relative w-full h-full animate-in zoom-in-95">
                                        <img
                                            src={senderForm.card_image_url}
                                            alt="Business Card"
                                            className="w-full h-full object-contain rounded-2xl shadow-2xl bg-white ring-1 ring-black/5"
                                        />
                                        <Button
                                            variant="destructive"
                                            size="icon"
                                            className="absolute -top-3 -right-3 h-10 w-10 rounded-full shadow-xl z-20 border-2 border-white"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleRemoveSenderImage();
                                            }}
                                        >
                                            <X className="h-5 w-5" />
                                        </Button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="w-20 h-20 rounded-3xl bg-white shadow-sm flex items-center justify-center group-hover/upload:scale-110 group-hover/upload:rotate-3 transition-transform duration-300">
                                            <FileIcon className="w-10 h-10 text-blue-500" />
                                        </div>
                                        <div className="text-center">
                                            <p className="font-black text-gray-900 text-lg">{t('senderInfo.uploadPlaceholder')}</p>
                                            <p className="text-xs text-gray-400 font-medium mt-1 uppercase tracking-tight">PNG, JPG up to 10MB</p>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-slate-100 pt-8">
                                {SENDER_FORM_KEYS.map((field) => (
                                    field !== 'card_image_url' && field !== 'card_image_name' && field !== 'ts_updated_at' && field !== 'ts_created_at' && field !== `html_image_urls` && field !== `detail_html` && field !== 'import_id' && field !== 'sender_id' && (
                                        <div key={field} className={cn("space-y-2.5", (field === 'memo' || field === 'address' || field === 'detail_html') && "md:col-span-2")}>
                                            <Label htmlFor={`sender-${field}`} className="text-xs font-black text-slate-600 uppercase tracking-widest flex items-center gap-2 ml-1">
                                                {field === "SNS_X" ? <SiX size={14} /> :
                                                    field === "SNS_Instagram" ? <SiInstagram size={14} /> :
                                                        field === "SNS_YouTube" ? <SiYoutube size={14} /> :
                                                            field === "SNS_Facebook" ? <SiFacebook size={14} /> :
                                                                field === "SNS_LINE" ? <SiLine size={14} /> :
                                                                    field === "SNS_TikTok" ? <SiTiktok size={14} /> :
                                                                        field === "SNS_Threads" ? <SiThreads size={14} /> :
                                                                            field === "Service_Linktree" ? <SiLinktree size={14} /> :
                                                                                field === "Service_Eight" ? <SiEight size={14} /> :
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
                                                    className="min-h-[100px] text-base rounded-2xl border-slate-200 focus:ring-blue-500 focus:border-blue-500 bg-slate-50/50 shadow-inner"
                                                    placeholder={t(`senderInfo.labels.${field}`)}
                                                />
                                            ) : (
                                                <Input
                                                    id={`sender-${field}`}
                                                    value={senderForm[field] || ""}
                                                    onChange={(e) => updateSenderForm(field, e.target.value)}
                                                    disabled={senderInfoLoading}
                                                    className="h-12 text-base rounded-2xl border-slate-200 focus:ring-blue-500 focus:border-blue-500 bg-slate-50/50 shadow-inner"
                                                    placeholder={t(`senderInfo.labels.${field}`)}
                                                    type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
                                                />
                                            )}
                                        </div>
                                    )
                                ))}

                                <div className="md:col-span-2 mt-6 flex justify-center">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="text-xs font-bold text-gray-500 hover:text-blue-600 hover:bg-blue-50 gap-2 px-6 h-10 rounded-full border-slate-200"
                                        onClick={() => setShowDetailHtmlSection(!showDetailHtmlSection)}
                                    >
                                        <Plus className={cn("w-4 h-4 transition-transform duration-300", showDetailHtmlSection && "rotate-180")} />
                                        {t(`senderInfo.labels.addhtmlmessage`)}
                                    </Button>
                                </div>

                                {showDetailHtmlSection && (
                                    <div className="md:col-span-2 flex flex-col space-y-6 pt-10 border-t border-slate-100 animate-in slide-in-from-top-4">
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor={`sender-detail_html`} className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                                                <Sparkles className="w-4 h-4 text-blue-500" />
                                                {t(`senderInfo.labels.detail_html`)}
                                            </Label>
                                        </div>
                                        <div className="flex flex-col w-full gap-6">
                                            <div className="w-full">
                                                <Textarea
                                                    id={`sender-detail_html`}
                                                    value={senderForm["detail_html"] || ""}
                                                    onChange={(e) => updateSenderForm("detail_html", e.target.value)}
                                                    disabled={senderInfoLoading}
                                                    className="min-h-[150px] text-sm font-mono rounded-2xl border-slate-200 bg-slate-900 text-slate-100 p-6 selection:bg-blue-500/30"
                                                    placeholder={t(`senderInfo.labels.detail_html-placeholder`)}
                                                />
                                            </div>

                                            <div className="flex flex-col gap-4">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                        <ImageIcon className="w-4 h-4 text-blue-500" />
                                                        {t(`senderInfo.labels.detail_html-images`)}
                                                    </span>
                                                </div>
                                                
                                                {htmlImageUrls.length === 0 ? (
                                                    <div className="p-8 border-2 border-dashed border-slate-100 rounded-3xl text-center bg-slate-50/30">
                                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">{t('senderInfo.labels.detail_html-noimages')}</p>
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-1 gap-3">
                                                        {htmlImageUrls.map((url, idx) => (
                                                            <div key={idx} className="flex items-center gap-4 p-3 bg-white rounded-2xl border border-slate-100 group hover:border-blue-400 hover:shadow-lg transition-all duration-300">
                                                                <div className="w-12 h-12 rounded-xl border bg-slate-50 overflow-hidden shrink-0 shadow-sm ring-1 ring-black/5">
                                                                    <img src={url} alt="HTML Asset" className="w-full h-full object-cover transition-transform group-hover:scale-110" onError={(e) => { (e.target as any).src = 'https://placehold.co/100x100?text=Error'; }} />
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-[10px] font-mono text-gray-400 truncate select-all">{url}</p>
                                                                </div>
                                                                <div className="flex items-center gap-2 opacity-20 group-hover:opacity-100 transition-opacity">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-10 w-10 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full"
                                                                        onClick={() => {
                                                                            navigator.clipboard.writeText(url);
                                                                            alert(t('senderInfo.urlCopied'));
                                                                        }}
                                                                    >
                                                                        <Copy className="w-4 h-4" />
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-10 w-10 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full"
                                                                        onClick={() => handleRemoveHtmlImage(url)}
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-12 text-xs font-black uppercase tracking-widest gap-2 bg-blue-50/50 hover:bg-blue-100 text-blue-600 border-blue-200 border-2 border-dashed rounded-2xl w-full"
                                                    onClick={() => (document.getElementById('htmlImageUpload') as HTMLInputElement)?.click()}
                                                >
                                                    <Plus className="w-4 h-4" />
                                                    {t(`senderInfo.labels.detail_html-addimage`)}
                                                </Button>
                                                
                                                <div className="bg-blue-600 p-6 rounded-[2rem] text-white shadow-xl shadow-blue-200 overflow-hidden relative">
                                                     <div className="absolute top-0 right-0 p-4 opacity-20">
                                                         <Sparkles className="w-16 h-16" />
                                                     </div>
                                                     <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-2 opacity-80">{t('senderInfo.usage')}</p>
                                                     <p className="text-sm font-bold leading-relaxed relative z-10">
                                                        {t('senderInfo.usageDesc1')} <code className="bg-white/20 px-1.5 py-0.5 rounded font-mono text-xs">&lt;img src="..."&gt;</code> {t('senderInfo.usageDesc2')}
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

                                <div className="md:col-span-2 flex flex-col gap-3 pt-8 border-t border-slate-100">
                                    <Button
                                        onClick={() => handleSenderInfoUpdate()}
                                        disabled={senderInfoLoading}
                                        className="w-full h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-lg font-black shadow-xl hover:shadow-blue-200 transition-all active:scale-95"
                                    >
                                        {senderInfoLoading ? <Loader2 className="w-5 h-5 animate-spin mr-3" /> : <SendHorizontal className="w-5 h-5 mr-3" />}
                                        {senderInfoLoading ? t('senderInfo.saving') : t('senderInfo.save')}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="rounded-full h-12 font-bold text-gray-500 hover:text-black"
                                        onClick={() => setIsEditingSender(false)}
                                    >
                                        {t('senderInfo.cancel')}
                                    </Button>
                                </div>
                            </div>
                            <div className="mt-24 border-b border-slate-100" />
                            <div className="flex justify-center -mt-5">
                                <Label className="bg-white px-8 py-2 text-xs font-black uppercase tracking-[0.3em] text-blue-600 border-2 border-blue-100 rounded-full shadow-sm">{t('senderInfo.preview')}</Label>
                            </div>
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
