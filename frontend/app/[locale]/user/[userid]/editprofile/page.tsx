"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MessageCircleQuestion, Paperclip, X, FileText, File as FileIcon, Loader2, Save, SendHorizontal, Pencil, UserPlus, Globe, Gift, User, MessagesSquare, Heart, Sparkles, Calendar, Clock, ShoppingBasket, Plus, Copy, Trash2, ChevronDown, ImageIcon, Import, Download } from "lucide-react";
import { SiFacebook, SiInstagram, SiThreads, SiX, SiYoutube, SiLine, SiTiktok, SiLinktree, SiEight } from "@icons-pack/react-simple-icons";
import SandboxedHtml from "@/components/SandboxedHtml";
import { cn } from "@/lib/utils";
import { resizeImage } from "@/lib/image-utils";
import { userApi } from "@/lib/api/user";
import { receiveApi } from "@/lib/api/receive"; // For upload URL (can reused if needed)
import { fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';

export default function UserProfilePage() {
    const t = useTranslations('ReceivePage');
    const params = useParams();
    const userid = params?.userid as string;
    const locale = params?.locale as string;

    const [loading, setLoading] = useState(true);
    const [isOwner, setIsOwner] = useState(false);
    const [isEditingSender, setIsEditingSender] = useState(false);
    const [senderInfoLoading, setSenderInfoLoading] = useState(false);
    
    // Auth Check
    useEffect(() => {
        async function checkAuth() {
            try {
                const user = await getCurrentUser();
                if (user && (user.userId === userid || user.username === userid)) {
                    setIsOwner(true);
                }
            } catch (e) {
                // Not logged in or error
            }
        }
        checkAuth();
    }, [userid]);

    const SENDER_FORM_KEYS = [
        "name", "job_title", "company", "department", "email", "phone", "phone_direct",
        "address", "HP", "memo", "SNS_Facebook", "SNS_Instagram", "SNS_Threads",
        "SNS_X", "SNS_YouTube", "SNS_LINE", "SNS_TikTok", "Service_Eight", "Service_Linktree"
    ];

    const [senderForm, setSenderForm] = useState<any>({
        name: "",
        job_title: "",
        company: "",
        department: "",
        email: "",
        phone: "",
        phone_direct: "",
        address: "",
        HP: "",
        memo: "",
        SNS_Facebook: "",
        SNS_Instagram: "",
        SNS_Threads: "",
        SNS_X: "",
        SNS_YouTube: "",
        SNS_LINE: "",
        SNS_TikTok: "",
        Service_Eight: "",
        Service_Linktree: "",
        detail_html: "",
        card_image_url: "",
        card_image_name: "",
        html_image_urls: [] as string[],
    });
    const [htmlImageUrls, setHtmlImageUrls] = useState<string[]>([]);
    const [showDetailHtmlSection, setShowDetailHtmlSection] = useState(false);

    // Initial Load
    const loadProfile = useCallback(async () => {
        setLoading(true);
        try {
            // We use a POST /user/profile/get even if it's viewing someone else's? 
            // In the backend I implemented it with Cognito auth.
            // If the user wants PUBLIC view, I'd need an unauthorized endpoint.
            // But the user said "to edit this", so let's stick to the management view.
            const data = await userApi.user_profile_get({});
            if (data.profile) {
                const sanitizedInfo = { ...data.profile };
                Object.keys(sanitizedInfo).forEach(key => {
                    if (sanitizedInfo[key] === null) sanitizedInfo[key] = "";
                });
                setSenderForm((prev: any) => ({ ...prev, ...sanitizedInfo }));
                setHtmlImageUrls(sanitizedInfo.html_image_urls || []);
                if (sanitizedInfo.detail_html) setShowDetailHtmlSection(true);
            }
        } catch (e: any) {
            console.error("Failed to load profile:", e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadProfile();
    }, [loadProfile]);

    const updateSenderForm = (field: string, value: string) => {
        setSenderForm((prev: any) => ({ ...prev, [field]: value }));
    };

    const handleSenderInfoUpdate = async () => {
        setSenderInfoLoading(true);
        try {
            await userApi.user_profile_update({
                profile: senderForm
            });
            await loadProfile();
            setIsEditingSender(false);
            alert(t('senderInfo.importSuccess')); 
        } catch (e: any) {
            alert(t('senderInfo.updateFailed') + (e.message || "Error"));
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
                contentType: file.type
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
        setSenderForm((prev: any) => ({
            ...prev,
            html_image_urls: next
        }));
    };

    const EmptySenderInfo = (info: any) => {
        return !info || Object.keys(info).every(key => {
            if (key.startsWith("ts_")) return true;
            if (key === "html_image_urls") return true;
            return !info[key];
        });
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

    if (!isOwner) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <Card className="w-full max-w-md p-6 text-center">
                    <h1 className="text-xl font-bold mb-4">Unauthorized</h1>
                    <p className="text-gray-500">You do not have permission to edit this profile.</p>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4">
            <Card className="w-full max-w-2xl shadow-xl border-none bg-white/80 backdrop-blur-md rounded-3xl overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 text-white flex flex-col gap-4">
                    <div className="flex justify-between items-start">
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-white hover:bg-white/20 -ml-2 h-8"
                            onClick={() => window.location.href = `/user/${userid}`}
                        >
                            <ChevronDown className="h-4 w-4 mr-1 rotate-90" /> {t('back')}
                        </Button>
                    </div>
                    <div className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-2xl font-black tracking-tight">{t('senderInfo.title')}</CardTitle>
                            <p className="text-blue-100/80 text-sm mt-1">Manage your digital identity</p>
                        </div>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-white hover:bg-white/20 rounded-full h-12 w-12"
                            onClick={() => setIsEditingSender(!isEditingSender)}
                        >
                            {isEditingSender ? <X className="h-6 w-6" /> : <Pencil className="h-5 w-5" />}
                        </Button>
                    </div>
                </CardHeader>

                <CardContent className="p-0">
                    {isEditingSender ? (
                        /* Editing Interface - Mirrored from receive page */
                        <div className="space-y-8 p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="bg-blue-50/50 rounded-2xl p-6 border border-blue-100 border-dashed text-center">
                                <p className="text-sm text-gray-600 font-medium">{t('senderInfo.description')}</p>
                            </div>

                            <div 
                                className="aspect-[1.6/1] w-full relative group cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-gray-200 hover:border-blue-400 hover:bg-blue-50/30 transition-all duration-300"
                                onClick={() => document.getElementById('senderCardUpload')?.click()}
                            >
                                        {senderForm.card_image_url ? (
                                            <div className="w-full h-full p-4 relative">
                                                <img src={senderForm.card_image_url} alt="Profile Card" className="w-full h-full object-contain rounded-lg shadow-2xl" />
                                                <Button 
                                                    variant="destructive" 
                                                    size="icon" 
                                                    className="absolute -top-2 -right-2 h-10 w-10 rounded-full shadow-lg z-10"
                                                    onClick={handleRemoveSenderImage}
                                                >
                                                    <X className="h-5 w-5" />
                                                </Button>
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl pointer-events-none">
                                                    <p className="text-white font-bold flex items-center gap-2">
                                                        <ImageIcon className="w-5 h-5" /> Change Image
                                                    </p>
                                                </div>
                                            </div>
                                        ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                                        <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center">
                                            <ImageIcon className="w-10 h-10 text-blue-600" />
                                        </div>
                                        <p className="font-bold text-gray-500">{t('senderInfo.uploadPlaceholder')}</p>
                                    </div>
                                )}
                            </div>
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

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-gray-100">
                                {SENDER_FORM_KEYS.map((field) => (
                                    <div key={field} className={cn("space-y-2", (field === 'memo' || field === 'address') && "md:col-span-2")}>
                                        <Label htmlFor={`field-${field}`} className="text-sm font-black text-gray-700 flex items-center gap-2">
                                            {field.startsWith("SNS_") || field.startsWith("Service_") || field === "HP" ? <Globe className="w-4 h-4 text-blue-500" /> : null}
                                            {t(`senderInfo.labels.${field}`)}
                                        </Label>
                                        {field === 'memo' || field === 'address' ? (
                                            <Textarea 
                                                id={`field-${field}`}
                                                value={senderForm[field] || ""}
                                                onChange={(e) => updateSenderForm(field, e.target.value)}
                                                className="rounded-xl border-gray-200 focus:ring-blue-500 focus:border-blue-500 min-h-[120px]"
                                                placeholder={t(`senderInfo.labels.${field}`)}
                                            />
                                        ) : (
                                            <Input 
                                                id={`field-${field}`}
                                                value={senderForm[field] || ""}
                                                onChange={(e) => updateSenderForm(field, e.target.value)}
                                                className="rounded-xl border-gray-200 h-11 focus:ring-blue-500 focus:border-blue-500"
                                                placeholder={t(`senderInfo.labels.${field}`)}
                                            />
                                        )}
                                    </div>
                                ))}

                                <div className="md:col-span-2 pt-4">
                                    <Button 
                                        variant="outline" 
                                        className="w-full rounded-2xl h-14 border-dashed border-2 hover:bg-gray-50 font-bold gap-2"
                                        onClick={() => setShowDetailHtmlSection(!showDetailHtmlSection)}
                                    >
                                        <Plus className={cn("w-5 h-5 transition-transform", showDetailHtmlSection && "rotate-45")} />
                                        Advanced HTML Content
                                    </Button>
                                    
                                    {showDetailHtmlSection && (
                                        <div className="mt-6 space-y-6 animate-in slide-in-from-top-4 duration-300">
                                            <div className="flex items-center justify-between">
                                                <Label className="text-sm font-black text-gray-700">{t('senderInfo.labels.detail_html')}</Label>
                                                <Button size="sm" variant="ghost" className="text-blue-600 text-xs font-bold gap-1">
                                                    <Download className="w-3 h-3" /> Download Prompt
                                                </Button>
                                            </div>
                                            <Textarea 
                                                value={senderForm.detail_html || ""}
                                                onChange={(e) => updateSenderForm("detail_html", e.target.value)}
                                                className="font-mono text-sm min-h-[250px] rounded-2xl border-gray-300"
                                                placeholder="<style>...</style><div>...</div>"
                                            />
                                            
                                            <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
                                                <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                    <ImageIcon className="w-4 h-4" /> HTML Assets
                                                </h3>
                                                <div className="grid grid-cols-1 gap-3">
                                                    {htmlImageUrls.map((url, idx) => (
                                                        <div key={idx} className="flex items-center gap-4 p-3 bg-white rounded-xl border border-gray-100 shadow-sm transition-all hover:shadow-md">
                                                            <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                                                                <img src={url} alt="asset" className="w-full h-full object-cover" />
                                                            </div>
                                                            <div className="flex-1 min-w-0 pr-2">
                                                                <p className="text-[10px] font-mono text-gray-400 truncate">{url}</p>
                                                            </div>
                                                            <div className="flex gap-1 shrink-0">
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="icon" 
                                                                    className="h-9 w-9 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                                                                    onClick={() => {
                                                                        navigator.clipboard.writeText(url);
                                                                        alert(t('senderInfo.urlCopied'));
                                                                    }}
                                                                >
                                                                    <Copy className="h-4 w-4" />
                                                                </Button>
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="icon" 
                                                                    className="h-9 w-9 text-gray-400 hover:text-red-600 hover:bg-red-50"
                                                                    onClick={() => handleRemoveHtmlImage(url)}
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    <Button 
                                                        variant="outline" 
                                                        className="w-full border-dashed rounded-xl h-11 text-blue-600 border-blue-200 hover:bg-blue-50"
                                                        onClick={() => (document.getElementById('profileHtmlImageUpload') as HTMLInputElement)?.click()}
                                                    >
                                                        <Plus className="w-4 h-4 mr-2" /> {t('senderInfo.labels.detail_html-addimage')}
                                                    </Button>
                                                    <input 
                                                        type="file" 
                                                        id="profileHtmlImageUpload" 
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
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-col gap-4 pt-8">
                                <Button 
                                    className="w-full h-14 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-lg font-black shadow-lg shadow-blue-500/25 gap-2"
                                    onClick={handleSenderInfoUpdate}
                                    disabled={senderInfoLoading}
                                >
                                    {senderInfoLoading ? <Loader2 className="animate-spin" /> : <Save />}
                                    {t('senderInfo.save')}
                                </Button>
                                <Button 
                                    variant="ghost" 
                                    className="h-12 rounded-2xl text-gray-500 font-bold"
                                    onClick={() => setIsEditingSender(false)}
                                >
                                    {t('senderInfo.cancel')}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        /* Preview/View Mode */
                        <div className="animate-in fade-in zoom-in-95 duration-700">
                            {senderForm.detail_html && (
                                <div className="p-4 sm:p-8">
                                    <div className="rounded-[2.5rem] overflow-hidden border border-gray-100 shadow-2xl bg-white relative">
                                        <SandboxedHtml html={senderForm.detail_html} />
                                        <div className="absolute inset-0 pointer-events-none rounded-[2.5rem] ring-1 ring-black/5 ring-inset" />
                                    </div>
                                </div>
                            )}

                            <div className="p-8 sm:px-12 space-y-10">
                                {senderForm.card_image_url && (
                                    <div className="p-2 bg-white rounded-3xl shadow-xl border border-gray-100/50">
                                        <img src={senderForm.card_image_url} alt="Card" className="w-full rounded-2xl" />
                                    </div>
                                )}

                                <div className="space-y-6">
                                    <div className="border-b-2 border-blue-600 pb-4">
                                        <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mb-1">Identity</p>
                                        <h2 className="text-3xl font-black text-gray-900 leading-none">{senderForm.name || "Enter Name"}</h2>
                                        <p className="text-gray-500 mt-2 font-medium">{senderForm.job_title} {senderForm.company && `@ ${senderForm.company}`}</p>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
                                        {SENDER_FORM_KEYS.filter(k => k !== 'name' && senderForm[k]).map(field => (
                                            <div key={field} className={cn("space-y-1", (field === 'memo' || field === 'address') && "sm:col-span-2")}>
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t(`senderInfo.labels.${field}`)}</p>
                                                <p className="text-gray-800 font-medium leading-relaxed">
                                                    {(field === 'HP' || field === 'memo') ? renderTextWithLinks(senderForm[field]) : senderForm[field]}
                                                </p>
                                            </div>
                                        ))}
                                    </div>

                                    {!EmptySenderInfoWithLinks(senderForm) && (
                                        <div className="pt-6">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Connect</p>
                                            <div className="flex flex-wrap gap-3">
                                                {SENDER_FORM_KEYS.filter(field => (field.startsWith("SNS_") || field.startsWith("Service_")) && senderForm[field]).map(field => {
                                                    const value = senderForm[field];
                                                    const url = value.startsWith('http') ? value : `https://${value}`;
                                                    return (
                                                        <Button 
                                                            key={field} 
                                                            variant="outline" 
                                                            className="rounded-full px-6 h-12 font-bold hover:bg-gray-50 border-gray-200 transition-all hover:scale-105 active:scale-95 gap-2"
                                                            onClick={() => window.open(url, '_blank')}
                                                        >
                                                            {field === 'SNS_X' ? <SiX className="w-4 h-4" /> : 
                                                             field === 'SNS_Instagram' ? <SiInstagram className="w-4 h-4" /> :
                                                             field === 'SNS_Facebook' ? <SiFacebook className="w-4 h-4" /> :
                                                             <Globe className="w-4 h-4" />}
                                                            {t(`senderInfo.labels.${field}`)}
                                                        </Button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="mt-12 text-center text-gray-400">
                <p className="text-sm font-bold tracking-widest uppercase">&copy; 2024 MeishiGawarini.</p>
            </div>
        </div>
    );
}
