/**
 * ファイル概要: ダイナミック受取ページ (QRコードスキャン後)
 * 目的: スキャンされたQRコード(UUID)に基づいてギフト情報を表示し、PIN認証、受取人の住所入力、チャット機能、およびステータス管理機能を提供します。
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MessageCircleQuestion, Paperclip, X, FileText, File as FileIcon, Loader2, SendHorizontal, Pencil, UserPlus, Globe, Gift, User, MessagesSquare, Heart, Sparkles, Calendar, Clock } from "lucide-react";
import { SiFacebook, SiInstagram, SiThreads, SiX, SiYoutube, SiLine, SiTiktok, SiLinktree, SiEight } from "@icons-pack/react-simple-icons";
import SandboxedHtml from "@/components/SandboxedHtml";
import { cn } from "@/lib/utils";
import confetti from "canvas-confetti";


const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const GIFT_REVEAL_DELAY_MS = 750;

// Verify PIN and Fetch Gift Details
const verifyGiftPin = async (uuid: string, pin: string, password?: string) => {
    const res = await fetch(`${NEXT_PUBLIC_API_URL}/recipient/qrcodes/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid, pin, password }),
    });

    if (!res.ok) {
        if (res.status === 404 || res.status === 403) {
            throw new Error("Invalid PIN, Password, or Gift not found");
        }
        throw new Error("Failed to verify PIN");
    }
    return res.json();
};

// Submit Address
const submitAddress = async (uuid: string, pin: string, addressData: any, password?: string) => {
    const res = await fetch(`${NEXT_PUBLIC_API_URL}/recipient/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            qr_id: uuid,
            pin_code: pin,
            shipping_info: addressData,
            password
        }),
    });

    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to submit address");
    }
    return res.json();
};

// Receive Gift
const receiveGift = async (uuid: string, pin: string) => {
    const res = await fetch(`${NEXT_PUBLIC_API_URL}/recipient/completed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            qr_id: uuid,
            pin_code: pin,
        }),
    });

    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to receive gift");
    }
    return res.json();
};

// Fetch Chat Messages
const fetchChatMessages = async (uuid: string, pin: string) => {
    const res = await fetch(`${NEXT_PUBLIC_API_URL}/recipient/qrcodes/${uuid}/chat?pin=${pin}`);
    if (!res.ok) throw new Error("Failed to fetch messages");
    return res.json();
};

// Post Chat Message
const postChatMessage = async (uuid: string, pin: string, username: string, message: string, fileData?: any) => {
    const res = await fetch(`${NEXT_PUBLIC_API_URL}/recipient/qrcodes/${uuid}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            pin,
            username,
            message,
            ...(fileData || {})
        }),
    });
    if (!res.ok) throw new Error("Failed to post message");
    return res.json();
};

// Get Upload URL
const getChatUploadUrl = async (uuid: string, pin: string, filename: string, contentType: string, fileSize: number) => {
    const res = await fetch(`${NEXT_PUBLIC_API_URL}/recipient/qrcodes/${uuid}/upload-url?pin=${pin}&filename=${encodeURIComponent(filename)}&contentType=${encodeURIComponent(contentType)}&fileSize=${fileSize}`);
    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to get upload URL");
    }
    return res.json();
};

// Image Resizer Utility
const resizeImage = (file: File, maxWidth: number = 1280): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement("canvas");
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                if (height > maxWidth) {
                    width = (width * maxWidth) / height;
                    height = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx?.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error("Canvas to Blob failed"));
                }, file.type, 0.8);
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
};

// Linkify Helper
const renderTextWithLinks = (text: string) => {
    if (!text) return text;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.split(urlRegex).map((part, i) => {
        if (part.match(urlRegex)) {
            return (
                <a
                    key={i}
                    href={part}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline break-all"
                >
                    {part}
                </a>
            );
        }
        return part;
    });
};

const fireConfetti = () => {
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };
    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;
    const interval: any = setInterval(function () {
        const timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) return clearInterval(interval);
        const particleCount = 50 * (timeLeft / duration);
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);
};

const ShakingGiftBox = ({ isShaking }: { isShaking?: boolean }) => (
    <div className={cn("flex flex-col items-center justify-center py-10 transition-transform", isShaking && "animate-shake")}>
        <div className="relative w-24 h-24 mb-4 flex items-center justify-center">
            <Gift size={64} className={cn("text-black stroke-[1.2] stroke-black animate-bounce")} />
        </div>
    </div>
);

export default function ReceivePage() {
    const t = useTranslations('ReceivePage');
    const tst = useTranslations('Status');
    const params = useParams();
    const uuid = params?.uuid as string;

    const [loading, setLoading] = useState(false);
    const [gift, setGift] = useState<any>(null);
    const [pin, setPin] = useState("");
    const [name, setName] = useState("");
    const [zipCode, setZipCode] = useState("");
    const [address, setAddress] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [preferredDate, setPreferredDate] = useState("");
    const [preferredTime, setPreferredTime] = useState("");

    // Password Protection State
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isRestricted, setIsRestricted] = useState(false); // True if password protected and not unlocked
    const [unlockPassword, setUnlockPassword] = useState(""); // For entering password to view details

    // Chat State
    const [messages, setMessages] = useState<any[]>([]);
    const [chatName, setChatName] = useState("");
    const [chatMessage, setChatMessage] = useState("");
    const [chatLoading, setChatLoading] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [totalSizeInfo, setTotalSizeInfo] = useState<number | null>(null);

    // Subscription
    const [notificationEmail, setNotificationEmail] = useState("");
    const [subscribing, setSubscribing] = useState(false);
    const [showWhiteFade, setShowWhiteFade] = useState(false);

    // Sender Info State
    const [senderInfo, setSenderInfo] = useState<any>(null);
    const [senderInfoLoading, setSenderInfoLoading] = useState(false);
    const [isEditingSender, setIsEditingSender] = useState(false);
    const [senderForm, setSenderForm] = useState({
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
    });

    const updateSenderForm = (field: string, value: string) => {
        setSenderForm(prev => ({ ...prev, [field]: value }));
    };
    const [chatcontent, setChatcontent] = useState("");

    // Steps: PIN -> FORM (or SHIPPED/SUCCESS) -> RESTRICTED (if blocked)
    const [step, setStep] = useState<"PIN" | "FORM" | "SUCCESS" | "SHIPPED" | "EXPIRED" | "COMPLETED" | "RESTRICTED">("PIN");

    const [error, setError] = useState<string | null>(null);
    const [pinError, setPinError] = useState("");

    const handleVerifyPin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setPinError("");
        setError(null);

        try {
            const [data] = await Promise.all([
                verifyGiftPin(uuid, pin),
                new Promise(resolve => setTimeout(resolve, GIFT_REVEAL_DELAY_MS)) // Artificial delay for shake
            ]);
            setGift(data);
            if (data.status === 'COMPLETED') {
                setShowWhiteFade(true);
            } else {
                fireConfetti();
            }

            if (data.is_password_protected && !data.is_authorized) {
                setStep("RESTRICTED");
                setIsRestricted(true);
            } else {
                setIsRestricted(false);
                // Check status
                if (data.status === 'USED') {
                    setStep("SUCCESS");
                } else if (data.status === 'COMPLETED') {
                    setStep("COMPLETED");
                } else if (data.status === 'SHIPPED') {
                    setStep("SHIPPED");
                } else if (data.status === 'ACTIVE') {
                    setStep("FORM");
                } else if (data.status === 'EXPIRED') {
                    setStep("EXPIRED");
                } else {
                    setError(t('errors.inactive'));
                }
            }

        } catch (err: any) {
            console.error(err);
            setPinError(t('errors.invalidPin'));
        } finally {
            setLoading(false);
        }
    };

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const [data] = await Promise.all([
                verifyGiftPin(uuid, pin, unlockPassword),
                new Promise(resolve => setTimeout(resolve, GIFT_REVEAL_DELAY_MS)) // Artificial delay for shake
            ]);
            if (data.is_authorized) {
                setGift(data);
                if (data.status === 'COMPLETED') {
                    setShowWhiteFade(true);
                } else {
                    fireConfetti();
                }
                setIsRestricted(false);
                // Determine step again
                if (data.status === 'USED') {
                    setStep("SUCCESS");
                } else if (data.status === 'COMPLETED') {
                    setStep("COMPLETED");
                } else if (data.status === 'SHIPPED') {
                    setStep("SHIPPED");
                } else if (data.status === 'ACTIVE') {
                    setStep("FORM");
                } else if (data.status === 'EXPIRED') {
                    setStep("EXPIRED");
                }
            } else {
                alert(t('errors.invalidPassword'));
            }
        } catch (e) {
            alert(t('errors.unlockFailed'));
        } finally {
            setLoading(false);
        }
    };

    const handleAddressSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            alert(t('errors.passwordMismatch'));
            return;
        }
        setLoading(true);
        try {
            await submitAddress(uuid, pin, { name, zipCode, address, phone, email, preferredDate, preferredTime }, password);
            setStep("SUCCESS");
        } catch (error: any) {
            console.error("Submission error:", error);
            alert(error.message || t('errors.submitFailed'));
        } finally {
            setLoading(false);
        }
    };

    const handleReceive = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await receiveGift(uuid, pin);
            setStep("COMPLETED");
        } catch (error: any) {
            console.error("Receive error:", error);
            alert(error.message || t('errors.receiveFailed'));
        } finally {
            setLoading(false);
        }
    };

    // Load messages and sender info when step is not PIN (i.e. logged in)
    const loadMessages = useCallback(async () => {
        try {
            const data = await fetchChatMessages(uuid, pin);
            setMessages(data.messages || []);
            setTotalSizeInfo(data.total_size_bytes || 0);
            setSenderInfo(data.sender_info || null);
            if (data.sender_info) {
                setSenderForm(prev => ({
                    ...prev,
                    ...data.sender_info
                }));
            }
        } catch (e) {
            console.error(e);
        }
    }, [uuid, pin]);

    // Toggle chat loading state if needed, or just effect.
    // Effect to reload when step changes to something other than PIN
    const [hasLoadedChat, setHasLoadedChat] = useState(false);

    useEffect(() => {
        if (step !== "PIN" && !hasLoadedChat && pin) {
            setHasLoadedChat(true);
            loadMessages();
        }
    }, [step, hasLoadedChat, pin, loadMessages]);

    const handleChatSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if ((!chatMessage && !selectedFile) || !chatName) return;

        setChatLoading(true);
        try {
            let fileData = null;
            if (selectedFile) {
                setUploading(true);
                let uploadFile: File | Blob = selectedFile;

                // Resize if image
                if (selectedFile.type.startsWith("image/")) {
                    try {
                        uploadFile = await resizeImage(selectedFile);
                    } catch (err) {
                        console.error("Resize failed, using original", err);
                    }
                }

                const { uploadUrl, publicUrl } = await getChatUploadUrl(
                    uuid,
                    pin,
                    selectedFile.name,
                    uploadFile.type,
                    uploadFile.size
                );

                const uploadRes = await fetch(uploadUrl, {
                    method: "PUT",
                    headers: { "Content-Type": uploadFile.type },
                    body: uploadFile
                });

                if (!uploadRes.ok) throw new Error("S3 Upload failed");

                fileData = {
                    file_url: publicUrl,
                    file_name: selectedFile.name,
                    file_type: selectedFile.type,
                    file_size: uploadFile.size
                };
            }

            await postChatMessage(uuid, pin, chatName, chatMessage, fileData);
            setChatMessage("");
            setSelectedFile(null);
            await loadMessages();
        } catch (e: any) {
            alert("Failed to send message: " + e.message);
        } finally {
            setChatLoading(false);
            setUploading(false);
        }
    };

    const handleSenderInfoUpdate = async (fields?: any) => {
        setSenderInfoLoading(true);
        try {
            const updatedSenderInfo = {
                ...senderInfo,
                ...(fields || senderForm),
                ts_updated_at: new Date().toISOString()
            };

            await fetch(`${NEXT_PUBLIC_API_URL}/recipient/qrcodes/${uuid}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    pin,
                    type: 'update_sender_info',
                    sender_info: updatedSenderInfo
                }),
            });

            await loadMessages();
            setIsEditingSender(false);
        } catch (e: any) {
            alert("Failed to update sender info: " + e.message);
        } finally {
            setSenderInfoLoading(false);
        }
    };

    const handleSenderInfoUpload = async (file: File) => {
        setSenderInfoLoading(true);
        try {
            let uploadFile: File | Blob = file;
            if (file.type.startsWith("image/")) {
                try {
                    uploadFile = await resizeImage(file);
                } catch (err) {
                    console.error("Resize failed", err);
                }
            }

            const { uploadUrl, publicUrl } = await getChatUploadUrl(
                uuid,
                pin,
                file.name,
                uploadFile.type,
                uploadFile.size
            );

            const uploadRes = await fetch(uploadUrl, {
                method: "PUT",
                headers: { "Content-Type": uploadFile.type },
                body: uploadFile
            });

            if (!uploadRes.ok) throw new Error("S3 Upload failed");

            const newSenderInfo = {
                ...senderForm,
                card_image_url: publicUrl,
                card_image_name: file.name,
                ts_updated_at: new Date().toISOString()
            };

            await fetch(`${NEXT_PUBLIC_API_URL}/recipient/qrcodes/${uuid}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    pin,
                    type: 'update_sender_info',
                    sender_info: newSenderInfo
                }),
            });

            await loadMessages();
        } catch (e: any) {
            alert("Failed to upload business card: " + e.message);
        } finally {
            setSenderInfoLoading(false);
        }
    };

    const getRemainingTime = (expiresAt: string) => {
        if (!expiresAt) return null;
        const diff = new Date(expiresAt).getTime() - new Date().getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        return { days, hours, minutes, seconds };
    };

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <Card className="w-full max-w-md border-red-200">
                    <CardHeader className="bg-red-50">
                        <CardTitle className="text-red-800">Error</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                        <p className="text-red-600">{error}</p>
                    </CardContent>
                </Card>
            </div>
        );
    }



    const handleSubscribe = async () => {
        if (!notificationEmail) return;

        // Email Validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(notificationEmail)) {
            alert(t('errors.invalidEmailFormat'));
            return;
        }

        setSubscribing(true);
        try {
            await fetch(`${NEXT_PUBLIC_API_URL}/recipient/qrcodes/${uuid}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    pin,
                    type: 'subscribe',
                    email: notificationEmail,
                    locale: params.locale // Send current language
                }),
            });
            alert(t('chat.subscribeSuccess'));
            setNotificationEmail("");
        } catch (e) {
            alert(t('chat.subscribeFailed'));
        } finally {
            setSubscribing(false);
        }
    };

    return (
        <div className={cn("min-h-screen bg-gray-50 flex flex-col items-center justify-center py-8 px-4 transition-all duration-1000", step === "COMPLETED" && "bg-olive-300 sepia-[.1] shadow-[inset_0_0_500px_rgba(0,0,0,0.8)]")}>
            {showWhiteFade && (
                <div
                    className="fixed inset-0 z-[100] bg-olive-800 animate-fade-out-white pointer-events-none"
                    onAnimationEnd={() => setShowWhiteFade(false)}
                />
            )}





            {/* Memory Section */}
            {step === "COMPLETED" && gift && (
                <div className="w-full max-w-xl mt-60 mb-60 overflow-hidden relative bg-mauve-100/40 rounded-xl shadow-sm">
                    <Card className="border-none shadow-none bg-transparent">
                        <CardContent className="flex flex-col items-center text-center space-y-6 py-8">
                            <div className="relative">
                                <div className="relative bg-white/80 p-4 rounded-full shadow-sm border border-gray-100">
                                    <Heart className="w-8 h-8 text-pink-400 fill-gray-50" />
                                </div>
                                <Sparkles className="absolute -top-3 -right-3 w-8 h-8 text-amber-300 animate-pulse" />
                            </div>

                            <div className="space-y-2">
                                <h2 className="text-2xl font-bold text-gray-700">
                                    {t('memorySection.title')}
                                </h2>
                                <p className="text-gray-500 text-sm max-w-[280px] mx-auto leading-relaxed">
                                    {t('memorySection.message')}
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-4 w-full pt-4">
                                <div className="bg-white/40 backdrop-blur-sm p-4 rounded-2xl border border-gray-200/50 shadow-sm flex flex-col items-center gap-2">
                                    <div className="p-2 bg-gray-50 rounded-lg">
                                        <Calendar className="w-4 h-4 text-gray-400" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">
                                            Moment
                                        </span>
                                        <span className="text-sm font-semibold text-gray-600">
                                            {gift.ts_submitted_at ? t('memorySection.daysPassed', {
                                                days: Math.floor((Date.now() - new Date(gift.ts_submitted_at).getTime()) / (1000 * 60 * 60 * 24))
                                            }) : "-"}
                                        </span>
                                    </div>
                                    <div className="pt-2 text-[10px] text-gray-400 flex items-center gap-1.5 font-medium">
                                        <div className="w-1 h-1 bg-gray-300 rounded-full" />
                                        {t('memorySection.submittedAt', { date: new Date(gift.ts_submitted_at).toLocaleDateString() })}
                                    </div>
                                </div>

                                <div className="bg-white/40 backdrop-blur-sm p-4 rounded-2xl border border-gray-200/50 shadow-sm flex flex-col items-center gap-2">
                                    <div className="p-2 bg-gray-50 rounded-lg">
                                        <Clock className="w-4 h-4 text-gray-400" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">
                                            Status
                                        </span>
                                        <span className="text-sm font-semibold text-gray-600">
                                            {tst(`${gift.status.toLowerCase()}`)}
                                        </span>
                                    </div>
                                    <div className="pt-2 text-[10px] text-gray-400 flex items-center gap-1.5 font-medium">
                                        <div className="w-1 h-1 bg-gray-300 rounded-full" />
                                        {t('memorySection.receivedAt', { date: new Date(gift.ts_completed_at).toLocaleDateString() })}
                                    </div>
                                </div>
                            </div>

                        </CardContent>
                    </Card>
                </div>
            )}












            {/* ========== Interactive Card Section ========== */}
            <Card className="w-full max-w-xl">
                <CardHeader>
                    <CardTitle className="text-xl text-center">
                        {step === "PIN" ? t('titles.pin') :
                            step === "RESTRICTED" ? tst(gift.status.toLowerCase()) : ""}
                    </CardTitle>
                </CardHeader>
                <CardContent className={cn("relative min-h-[300px] flex flex-col justify-center transition-colors duration-1000", step !== "PIN" && "bg-gradient-to-b from-white to-amber-50/20")}>
                    <style dangerouslySetInnerHTML={{
                        __html: `
                        @keyframes shake {
                            0% { transform: translate(1px, 1px) rotate(0deg); }
                            10% { transform: translate(-1px, -2px) rotate(-1deg); }
                            20% { transform: translate(-3px, 0px) rotate(1deg); }
                            30% { transform: translate(3px, 2px) rotate(0deg); }
                            40% { transform: translate(1px, -1px) rotate(1deg); }
                            50% { transform: translate(-1px, 5px) rotate(-1deg); }
                            60% { transform: translate(-3px, 1px) rotate(0deg); }
                            70% { transform: translate(3px, 1px) rotate(-1deg); }
                            80% { transform: translate(-1px, -1px) rotate(1deg); }
                            90% { transform: translate(1px, 2px) rotate(0deg); }
                            100% { transform: translate(1px, -2px) rotate(-1deg); }
                        }
                        .animate-shake {
                            animation: shake 0.5s infinite;
                        }
                        @keyframes reveal-gift {
                            0% { transform: scale(0.8) translateY(20px); opacity: 0; filter: blur(10px); }
                            100% { transform: scale(1) translateY(0); opacity: 1; filter: blur(0); }
                        }
                        .animate-reveal {
                            animation: reveal-gift 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
                        }
                        .reveal-delay-200 {
                            animation-delay: 0.2s;
                            opacity: 0;
                        }
                        @keyframes shine {
                            0% { transform: translateX(-100%); opacity: 0; }
                            50% { opacity: 0.5; }
                            100% { transform: translateX(100%); opacity: 0; }
                        }
                        .animate-shine {
                            animation: shine 3s infinite;
                        }
                        @keyframes float {
                            0%, 100% { transform: translateY(0); }
                            50% { transform: translateY(-5px); }
                        }
                        .animate-float {
                            animation: float 3s ease-in-out infinite;
                        }
                        @keyframes fade-out-white {
                            0% { opacity: 1; }
                            100% { opacity: 0; }
                        }
                        .animate-fade-out-white {
                            animation: fade-out-white 3s ease-in-out forwards;
                        }
                    `}} />

                    {(loading || step === "PIN" || step === "RESTRICTED") && !gift?.product && (
                        <ShakingGiftBox isShaking={loading} />
                    )}

                    {!loading && step !== "PIN" && gift && gift.product && (
                        <div className="animate-reveal space-y-4 pt-4">
                            {/* Hero Image */}
                            <div className="relative mb-6 overflow-hidden rounded-xl shadow-2xl group border-4 border-white/50">
                                <img
                                    src={gift.product.image_url}
                                    alt="Gift"
                                    className="w-full max-h-72 object-cover transform transition-transform duration-700 group-hover:scale-105"
                                />
                                {/* Diagonal Corner Ribbon (Top Right) */}
                                <div className="absolute top-0 right-0 w-24 h-24 overflow-hidden pointer-events-none z-10 animate-reveal reveal-delay-200">
                                    <div className={cn("absolute top-[18px] right-[-32px] w-[120px] text-white text-[10px] font-bold py-1 shadow-lg rotate-45 text-center uppercase tracking-wider border-y border-white/30 backdrop-blur-sm", gift.status !== "COMPLETED" ? "bg-red-500" : "bg-red-900")}>
                                        Gift for you!
                                    </div>
                                </div>

                                {/* Diagonal Corner Ribbon (Bottom Left) */}
                                <div className="absolute bottom-0 left-0 w-24 h-24 overflow-hidden pointer-events-none z-10 animate-reveal reveal-delay-200">
                                    <div className={cn("absolute bottom-[18px] left-[-32px] w-[120px] text-white text-[10px] font-bold py-1 shadow-lg rotate-45 text-center uppercase tracking-wider border-y border-white/30 backdrop-blur-sm", gift.status !== "COMPLETED" ? "bg-red-500" : "bg-red-900")}>
                                        Have a nice time!
                                    </div>
                                </div>

                                {/* Elegant Shimmer Overlay */}
                                <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-black/5 pointer-events-none" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent pointer-events-none" />
                                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                                    <div className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 animate-shine" />
                                </div>
                            </div>
                            {/* <h1 className="relative z-20 text-4xl font-extrabold mb-1 text-center bg-clip-text text-transparent bg-gradient-to-r from-red-500 via-red-500 to-red-500 drop-shadow-sm drop-shadow-white animate-float"> */}
                            <h1 className="relative z-20 text-4xl font-extrabold mb-1 text-center text-black drop-shadow-sm mt-10">
                                {gift.product.name}
                            </h1>
                            <p className="text-gray-600 mb-6 italic leading-relaxed text-center mb-10">{gift.product.description}</p>

                            {/* Shop memo */}
                            {gift.memo_for_users && (
                                <div className="mt-6 p-4 bg-amber-50/50 rounded-xl border border-amber-200/50 shadow-sm backdrop-blur-sm">
                                    <h3 className="font-bold text-xs uppercase tracking-wider text-amber-800 mb-2 flex items-center gap-2">
                                        <div className="w-1 h-3 bg-amber-400 rounded-full" />
                                        {t('shopMessage')}
                                    </h3>
                                    <p className="text-sm text-amber-900/80 whitespace-pre-wrap leading-relaxed">{gift.memo_for_users}</p>
                                </div>
                            )}

                            {/* Remaining Days for Active Gift */}
                            {step === "FORM" && gift.ts_expired_at && (
                                <div className="mt-4">
                                    <p className="text-sm font-semibold text-green-600 border border-green-200 bg-green-50 p-2 rounded text-center">
                                        {t('daysRemaining', getRemainingTime(gift.ts_expired_at)!)}
                                    </p>
                                    <p className="text-center text-sm text-gray-500 mt-1">
                                        {t('limitdatetime', { datetime: new Date(gift.ts_expired_at).toLocaleString() })}
                                    </p>
                                </div>
                            )}


                            {/* Expired Message */}
                            {step === "EXPIRED" && (
                                <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded text-center">
                                    <p className="text-red-600 font-bold">{t('expiredStep.message')}</p>
                                    <p className="text-red-500 text-sm mt-1">{t('expiredStep.subMessage', { date: new Date(gift.ts_expired_at).toLocaleDateString() })}</p>
                                </div>
                            )}

                            <Label className="text-xl text-center flex flex-col text-gray-500">
                                {step === "FORM" ? t('titles.form') :
                                    step === "SUCCESS" ? t('titles.success') :
                                        step === "SHIPPED" ? t('titles.shipped') :
                                            step === "EXPIRED" ? t('titles.expired') :
                                                step === "COMPLETED" ? t('titles.completed') : ""}
                            </Label>
                        </div>
                    )}
                    {step === "PIN" && !gift?.product && (
                        <form onSubmit={handleVerifyPin} className={cn("space-y-6 transition-opacity", loading && "opacity-50 pointer-events-none")}>
                            <div className="space-y-2 p-4 bg-gray-50 rounded-lg">
                                <Label htmlFor="pin" className="font-semibold">{t('pinStep.label')}</Label>
                                <Input
                                    id="pin"
                                    type="text"
                                    placeholder={t('pinStep.placeholder')}
                                    value={pin}
                                    disabled={loading}
                                    onChange={(e) => {
                                        setPin(e.target.value);
                                        setPinError("");
                                    }}
                                />
                                {pinError && <p className="text-sm text-red-500">{pinError}</p>}
                            </div>
                            <Button type="submit" className="w-full" disabled={loading || !pin}>
                                {loading ? t('pinStep.verifying') : t('pinStep.submit')}
                            </Button>
                        </form>
                    )}

                    {step === "RESTRICTED" && !gift?.product && (
                        <div className={cn("space-y-6 border-t mt-4 transition-opacity", loading && "opacity-50 pointer-events-none")}>
                            <div className="text-center space-y-2 mt-4">
                                <p className="text-yellow-600 font-medium">{t('restrictedStep.title')}</p>
                                <p className="text-sm text-gray-500">{t('restrictedStep.message')}</p>
                            </div>
                            <form onSubmit={handleUnlock} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="unlockPassword">{t('restrictedStep.passwordLabel')}</Label>
                                    <Input
                                        id="unlockPassword"
                                        type="password"
                                        value={unlockPassword}
                                        disabled={loading}
                                        onChange={(e) => setUnlockPassword(e.target.value)}
                                        required
                                    />
                                </div>
                                <Button type="submit" className="w-full" disabled={loading}>
                                    {loading ? t('restrictedStep.verifying') : t('restrictedStep.unlock')}
                                </Button>
                            </form>
                        </div>
                    )}

                    {step === "FORM" && (
                        <form onSubmit={handleAddressSubmit} className="space-y-6">
                            <div className="space-y-4 pt-8 mt-16 border-t">
                                <Label className="font-semibold">{t('formStep.title')}</Label>
                                <div className="space-y-2">
                                    <Label htmlFor="name">{t('formStep.name')}</Label>
                                    <Input
                                        id="name"
                                        required
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="zipCode">{t('formStep.zipCode')}</Label>
                                    <Input
                                        id="zipCode"
                                        required
                                        value={zipCode}
                                        onChange={(e) => setZipCode(e.target.value)}
                                        placeholder="123-4567"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="address">{t('formStep.address')}</Label>
                                    <Input
                                        id="address"
                                        required
                                        value={address}
                                        onChange={(e) => setAddress(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="phone">{t('formStep.phone')}</Label>
                                    <Input
                                        id="phone"
                                        type="tel"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        placeholder="090-1234-5678"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">{t('formStep.email')}</Label>
                                    <p className="text-xs text-gray-500">{t('formStep.emailDescription')}</p>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="you@example.com"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="preferredDate">{t('formStep.preferredDate')}</Label>
                                    <div className="flex gap-2 items-center">
                                        <Input
                                            id="preferredDate"
                                            type="date"
                                            value={preferredDate}
                                            onChange={(e) => setPreferredDate(e.target.value)}
                                            className="flex-1"
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => setPreferredDate("")}
                                            className="whitespace-nowrap"
                                        >
                                            {t('formStep.noPreference')}
                                        </Button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="preferredTime">{t('formStep.preferredTime')}</Label>
                                    <select
                                        id="preferredTime"
                                        value={preferredTime}
                                        onChange={(e) => setPreferredTime(e.target.value)}
                                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <option value="">{t('formStep.noPreference')}</option>
                                        <option value="午前中">{t('formStep.timeMorning')}</option>
                                        <option value="14-16時">{t('formStep.time1416')}</option>
                                        <option value="16-18時">{t('formStep.time1618')}</option>
                                        <option value="18-20時">{t('formStep.time1820')}</option>
                                        <option value="19-21時">{t('formStep.time1921')}</option>
                                    </select>
                                </div>

                                {/* Password Setting Section */}
                                {/* <div className="space-y-4 pt-8 mt-16 border-t">
                                    <Label className="font-semibold text-blue-800">{t('formStep.passwordTitle')}</Label>
                                    <p className="text-xs text-gray-500">
                                        {t('formStep.passwordDescription')}
                                    </p>
                                    <div className="space-y-2">
                                        <Label htmlFor="password">{t('formStep.passwordLabel')}</Label>
                                        <Input
                                            id="password"
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder={t('formStep.passwordPlaceholder')}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="confirmPassword">{t('formStep.confirmPasswordLabel')}</Label>
                                        <Input
                                            id="confirmPassword"
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder={t('formStep.confirmPasswordPlaceholder')}
                                        />
                                    </div>
                                </div> */}


                                {/* Password Setting Section (Commented out) */}
                            </div>


                            <Button type="submit" className="w-full mt-8" disabled={loading}>
                                {loading ? t('formStep.submitting') : t('formStep.submit')}
                            </Button>
                            <p className="text-xs text-gray-500 text-center">{t('formStep.privacyPolicy')}</p>
                        </form>
                    )}

                    {step === "SUCCESS" && (
                        <div className="text-center py-6 space-y-4">
                            <p className="text-green-600 font-medium">{t('successStep.message')}</p>
                            <p className="text-sm text-gray-500">{t('successStep.subMessage')}</p>
                        </div>
                    )}

                    {step === "SHIPPED" && gift && (
                        <div className="text-center py-6 space-y-4">
                            <p className="text-green-600 font-medium">{t('shippedStep.message')}</p>
                            {/* Assuming gift object has shipping details if fetched */
                                console.log(gift)
                            }

                            {gift.delivery_company && (
                                <p className="text-sm text-gray-500">{t('shippedStep.deliveryCompany', { company: gift.delivery_company })}</p>
                            )}
                            {gift.tracking_number && (
                                <p className="text-sm text-gray-500">{t('shippedStep.tracking', { number: gift.tracking_number })}</p>
                            )}
                            <hr className="my-10 border-gray-200" />

                            <p className="text-gray-600 text-sm">{t('shippedStep.receivedMessage')}</p>
                            <Button type="submit" className="w-full" variant="outline" onClick={handleReceive} disabled={loading}>
                                {loading ? t('formStep.submitting') : t('shippedStep.receivedButton')}
                            </Button>

                        </div>
                    )}

                    {step === "COMPLETED" && gift && (
                        <div />
                        // <div className="text-center py-6 space-y-4">
                        //     <p className="text-green-600 font-medium">{t('shippedStep.compleatedMessage')}</p>
                        // </div>
                    )}
                    {(step === "SUCCESS" || step === "SHIPPED" || step === "COMPLETED") && (
                        <div className=" text-right">
                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button variant="ghost" size="sm" className="text-gray-500 hover:text-gray-800 text-xs">
                                        <MessageCircleQuestion className="w-4 h-4" />
                                        {t('contactInfo.title')}
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-md">
                                    <DialogHeader>
                                        <DialogTitle>{t('contactInfo.title')}</DialogTitle>
                                        <DialogDescription className="text-xs text-gray-500">
                                            {t('contactInfo.note')}
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                            <Label className="text-xs text-gray-500">{t('contactInfo.orderId')}</Label>
                                            <div className="p-3 bg-gray-50 rounded-md border border-gray-200 font-mono text-sm select-all text-center">
                                                {uuid}
                                            </div>
                                        </div>
                                        {gift?.shop_name && (
                                            <div className="space-y-2">
                                                <Label className="text-xs text-gray-500">{t('contactInfo.shopName')}</Label>
                                                <div className="p-3 bg-gray-50 rounded-md border border-gray-200 text-sm break-all text-center font-medium">
                                                    {gift.shop_name}
                                                </div>
                                            </div>
                                        )}
                                        {gift?.shop_email && (
                                            <div className="space-y-2">
                                                <Label className="text-xs text-gray-500">{t('contactInfo.shopEmail')}</Label>
                                                <div className="p-3 bg-blue-50 rounded-md border border-blue-100 text-center">
                                                    <a href={`mailto:${gift.shop_email}`} className="text-blue-600 font-medium hover:underline text-sm break-all">
                                                        {gift.shop_email}
                                                    </a>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>
                    )}
                </CardContent>
            </Card>



            {/* Sender Info Section */}
            {(step === "FORM" && !isEditingSender && !senderInfo) && (
                <div>
                    <Card className="w-full max-w-xl mt-20 flex flex-col items-center justify-center cursor-pointer p-6 border-3 border-dashed border-black-100 rounded-xl bg-gray-50/50 hover:bg-blue-200/50  hover:border-blue-200 transition-colors"
                        onClick={() => setIsEditingSender(!isEditingSender)}
                    >
                        {/* <CardHeader className="w-full flex flex-col items-center justify-center cursor-pointer p-6 border border-dash rounded-xl bg-gray-50/50 hover:bg-white transition-colors"> */}
                        <CardTitle className="text-xl text-center flex items-center justify-center gap-2">
                            <UserPlus className="w-5 h-5 text-gray-600" />
                            {t('senderInfo.title-empty')}
                        </CardTitle>
                        {/* </CardHeader> */}
                    </Card>
                </div>
            )}
            {(senderInfo || isEditingSender) ? (
                < Card className="w-full max-w-xl mt-20 flex flex-col">
                    <CardContent className="min-h-0 flex flex-col">
                        {/* --- Sender Info Section --- */}
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                            <div className="flex justify-between gap-2">
                                <Label className="font-bold text-gray-800 flex items-center text-lg">
                                    {/* <div className="w-1.5 h-6 bg-blue-600 rounded-full" /> */}
                                    <User className="w-5 h-5 text-gray-600" />
                                    {t('senderInfo.title')}
                                </Label>
                                <div className="flex flex-row items-center">
                                    {(senderInfo && senderInfo.ts_updated_at) && (
                                        <span className="text-[10px] text-gray-400 flex items-center">
                                            {new Date(senderInfo.ts_updated_at).toLocaleString()} {t('senderInfo.updated')}
                                        </span>
                                    )}
                                    {(senderInfo && step === "FORM") ? (
                                        <div className="flex items-center flex items-center">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-10 w-10 text-gray-400 hover:text-gray-600"
                                                onClick={() => setIsEditingSender(!isEditingSender)}
                                            >
                                                {isEditingSender ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                    ) : ""}
                                </div>
                            </div>

                            <div className="relative group/card overflow-hidden">
                                {(step === "FORM" || isEditingSender) ? (
                                    <div className="space-y-6">
                                        <div
                                            className="aspect-[1.6/1] w-full flex flex-col items-center justify-center gap-3 cursor-pointer p-6 border rounded-xl bg-gray-50/50 hover:bg-white transition-colors"
                                            onClick={() => document.getElementById('senderCardUpload')?.click()}
                                        >
                                            <img
                                                src={senderInfo.card_image_url}
                                                alt="Business Card"
                                                className="w-full h-full object-contain rounded-lg shadow-md bg-white ring-1 ring-black/5"
                                            />
                                            <p className="text-xs text-gray-500">
                                                {t('senderInfo.description')}
                                            </p>
                                            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center group-hover/card:scale-110 transition-transform">
                                                <FileIcon className="w-8 h-8 text-blue-500" />
                                            </div>
                                            <div className="text-center">
                                                <p className="font-semibold text-gray-800">{t('senderInfo.uploadPlaceholder')}</p>
                                                <p className="text-xs text-gray-400 mt-1">{t('senderInfo.uploadHint')}</p>
                                            </div>
                                            <p className="text-[10px] text-gray-400 text-center italic">
                                                {t('senderInfo.notice')}
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-6">
                                            {Object.keys(senderForm).map((field) => (
                                                field !== 'card_image_url' && field !== 'card_image_name' && field !== 'ts_updated_at' && (
                                                    <div key={field} className={cn("space-y-1.5", (field === 'memo' || field === 'address') && "md:col-span-2")}>
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
                                                                value={(senderForm as any)[field]}
                                                                onChange={(e) => updateSenderForm(field, e.target.value)}
                                                                disabled={senderInfoLoading}
                                                                className="min-h-[80px] text-sm"
                                                                placeholder={t(`senderInfo.labels.${field}`)}
                                                            />
                                                        ) : (
                                                            <Input
                                                                id={`sender-${field}`}
                                                                value={(senderForm as any)[field]}
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
                                            <div className="md:col-span-2 pt-2 flex flex-col gap-2">
                                                <Button
                                                    onClick={() => handleSenderInfoUpdate()}
                                                    disabled={senderInfoLoading}
                                                    className="w-full bg-blue-600 hover:bg-blue-700"
                                                >
                                                    {senderInfoLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <SendHorizontal className="w-4 h-4 mr-2" />}
                                                    {senderInfoLoading ? t('senderInfo.saving') : t('senderInfo.save')}
                                                </Button>
                                                {isEditingSender && (
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        onClick={() => setIsEditingSender(false)}
                                                        className="w-full"
                                                    >
                                                        {t('senderInfo.cancel')}
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="mb-10 border-b" />
                                        <Label className="w-full flex flex-col text-center text-xl ">{t('senderInfo.preview')}</Label>
                                    </div>
                                ) : ""}

                                {/* 実際に表示する箇所 */}
                                {senderInfo ? (
                                    <div>
                                        <div className="w-full p-4">
                                            <img
                                                src={senderInfo.card_image_url}
                                                alt="Business Card"
                                                className="w-full h-full object-contain rounded-lg shadow-md bg-white ring-1 ring-black/5 mb-8 border"
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 ml-6 mr-6 mb-8">
                                            {Object.entries(senderForm).map(([field, value]) => value &&
                                                field == "name" && (
                                                    <div key={field} className={cn("flex flex-col border-b border-gray-50 pb-2 sm:col-span-2")}>
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase">
                                                            {t(`senderInfo.labels.${field}`)}
                                                        </span>
                                                        <span className={cn("text-gray-800 break-words whitespace-pre-wrap text-xl font-bold")}>
                                                            {value}
                                                        </span>
                                                    </div>
                                                ))}
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 ml-6 mr-6">
                                            {Object.entries(senderForm).map(([field, value]) => value &&
                                                field !== 'card_image_url' &&
                                                field !== 'card_image_name' &&
                                                field !== 'ts_updated_at' &&
                                                field !== 'name' &&
                                                !field.startsWith("SNS_") &&
                                                !field.startsWith("Service_") && (
                                                    <div key={field} className={cn("flex flex-col border-b border-gray-50 pb-2", (field === 'memo' || field === 'address') && "sm:col-span-2")}>
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase">
                                                            {t(`senderInfo.labels.${field}`)}
                                                        </span>
                                                        <span className={cn("text-gray-800 break-words", (field === 'memo' || field === 'address') && "whitespace-pre-wrap text-sm")}>
                                                            {field === 'HP' || field === 'memo' ? renderTextWithLinks(value) : value}
                                                        </span>
                                                    </div>
                                                ))}
                                        </div>
                                        <div className="gap-1 ml-6 mr-6">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase">
                                                LINK
                                            </span>
                                            <div className="flex flex-wrap gap-1">
                                                {Object.entries(senderForm).map(([field, value]) => value && (field.startsWith("SNS_") || field.startsWith("Service_")) ? (
                                                    <Button
                                                        key={field}
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-8 gap-2 bg-white hover:bg-gray-50 border-gray-200 text-gray-700 relative group"
                                                        onClick={() => {
                                                            const url = value.startsWith('http') ? value : `https://${value}`;
                                                            window.open(url, '_blank', 'noopener,noreferrer');
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
                                                ) : "")}
                                            </div>
                                        </div>
                                        <input
                                            type="file"
                                            id="senderCardUpload"
                                            className="hidden"
                                            accept="image/*"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) handleSenderInfoUpload(file);
                                                e.target.value = "";
                                            }}
                                        />
                                        {senderInfoLoading && (
                                            <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-10 transition-all">
                                                <div className="flex flex-col items-center gap-2">
                                                    <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                                                    <p className="text-xs font-bold text-blue-800">{t('senderInfo.uploading') || "アップロード中..."}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : ""}
                            </div>
                        </div>
                        {/* --------------------------- */}
                    </CardContent>
                </Card>
            ) : ""}


            {/* Chat Section */}
            {
                step !== "PIN" && (
                    <Card className={cn("w-full max-w-xl mt-20 flex flex-col", step !== "COMPLETED" && "max-h-[calc(100vh-12rem)] min-h-[800px] overflow-hidden")}>

                        <CardHeader>
                            <CardTitle className="text-xl text-center flex items-center justify-left gap-2">
                                <MessagesSquare className="w-5 h-5 text-gray-600" />
                                {t('chat.title')}
                            </CardTitle>
                        </CardHeader>

                        <CardContent className="min-h-0 flex">
                            <div className={cn("flex-1 min-h-0 flex flex-col pt-0 pb-0 overflow-y-auto space-y-2 rounded-xl", step !== "COMPLETED" && "bg-gray-100 border shadow-sm")} >
                                {messages.length === 0 ? (
                                    <p className="text-sm text-gray-500 text-center py-4">{t('chat.noMessages')}</p>
                                ) : (
                                    messages.slice().map((msg) => {
                                        const isSystem = msg.username === 'System';
                                        const displayUsername = isSystem ? t('chat.system') : msg.username;
                                        const displayMessage = (isSystem && msg.message === 'DeliveryCompleted')
                                            ? t('chat.systemMessage.deliveryCompleted')
                                            : msg.message;

                                        return (
                                            <div key={msg.id} className={`${isSystem ? 'bg-blue-50 border-blue-100' : ''} p-2 rounded-xl text-sm ${msg.username === chatName ? 'ml-10' : 'mr-10'}`}>
                                                <p className={`font-bold text-xs ml-1 mb-1 flex items-center gap-1.5 ${isSystem ? 'text-blue-700' : 'text-gray-600'}`}>
                                                    <span className={`w-2 h-2 rounded-full shrink-0 ${isSystem ? 'bg-blue-500' : 'bg-gray-400'}`} />
                                                    {displayUsername}
                                                    <span className="text-gray-400 font-normal ml-2">• {new Date(msg.ts_created_at).toLocaleString()}</span>
                                                </p>
                                                <div className="bg-white p-2 rounded-xl shadow-sm border">
                                                    <p className={`whitespace-pre-wrap ml-2 ${isSystem ? 'text-blue-900' : ''}`}>
                                                        {displayMessage}
                                                    </p>
                                                    {msg.file_url && (
                                                        <div className={`rounded p-4 ${displayMessage ? '' : ''}`}>
                                                            {msg.file_type?.startsWith("image/") ? (
                                                                <a href={msg.file_url} target="_blank" rel="noopener noreferrer" >
                                                                    <img src={msg.file_url} alt={msg.file_name} className="max-w-full max-h-64 object-contain mx-auto rounded-xl shadow-sm" />
                                                                </a>
                                                            ) : msg.file_type?.startsWith("video/") ? (
                                                                // <div className="rounded-xl overflow-hidden shadow-sm bg-black/90 aspect-video max-h-64 flex items-center justify-center mx-auto">
                                                                <video
                                                                    src={msg.file_url}
                                                                    controls
                                                                    className="max-h-64 max-w-full rounded-xl overflow-hidden shadow-sm bg-black/90 aspect-video flex items-center justify-center mx-auto"
                                                                    playsInline
                                                                >
                                                                    {t('chat.videoUnsupported')}
                                                                </video>
                                                                // </div>
                                                            ) : (
                                                                <a
                                                                    href={msg.file_url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="flex items-center p-2 gap-3 hover:bg-gray-100 transition-colors"
                                                                >
                                                                    <FileText className="w-8 h-8 text-gray-500" />
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-sm font-medium truncate text-blue-600 underline">{msg.file_name}</p>
                                                                        <p className="text-xs text-gray-400">
                                                                            {msg.file_size ? `${(msg.file_size / 1024 / 1024).toFixed(2)} MB` : ''}
                                                                        </p>
                                                                    </div>
                                                                </a>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                                <div className="mb-10" />
                            </div>
                        </CardContent>
                        {step !== "COMPLETED" && (
                            <CardFooter className="flex flex-col pt-0 bg-white">
                                <form onSubmit={handleChatSubmit} className="w-full space-y-2 p-4 rounded-xl border-1 shadow-sm transition-all bg-gray-50">
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="chatName" className="text-xs font-bold shrink-0 whitespace-nowrap">
                                            {t('chat.name')}
                                        </Label>
                                        <Input
                                            id="chatName"
                                            placeholder={t('chat.namePlaceholder')}
                                            value={chatName}
                                            onChange={(e) => setChatName(e.target.value)}
                                            required
                                            className="h-8 flex-1 bg-white"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-start gap-2">
                                            <div className="flex-1">
                                                <Label htmlFor="chatMessage" className="text-xs sr-only">{t('chat.message')}</Label>
                                                <Textarea
                                                    id="chatMessage"
                                                    placeholder={t('chat.placeholder')}
                                                    value={chatMessage}
                                                    onChange={(e) => setChatMessage(e.target.value)}
                                                    className="min-h-[100px] bg-white"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-2 shrink-0">
                                                <div className="relative">
                                                    <input
                                                        type="file"
                                                        id="chatFile"
                                                        className="hidden"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) setSelectedFile(file);
                                                            e.target.value = ""; // Reset
                                                        }}
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="icon"
                                                        className={cn("h-[46px] w-10 shrink-0", selectedFile && "bg-blue-50 border-blue-200 text-blue-600 ")}
                                                        onClick={() => document.getElementById('chatFile')?.click()}
                                                        disabled={chatLoading}
                                                    >
                                                        <Paperclip className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                                <Button
                                                    type="submit"
                                                    size="icon"
                                                    className="h-[46px] w-10 shrink-0"
                                                    disabled={chatLoading || (totalSizeInfo !== null && totalSizeInfo > 100 * 1024 * 1024)}
                                                >
                                                    {chatLoading ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <SendHorizontal className="h-4 w-4" />
                                                    )}
                                                </Button>
                                            </div>
                                        </div>

                                        {selectedFile && (
                                            <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-md border border-blue-100 animate-in fade-in slide-in-from-top-1">
                                                <div className="flex-1 min-w-0 flex items-center gap-2">
                                                    {selectedFile.type.startsWith("image/") ? (
                                                        <div className="w-8 h-8 rounded bg-white border overflow-hidden shrink-0">
                                                            <img
                                                                src={URL.createObjectURL(selectedFile)}
                                                                alt="Preview"
                                                                className="w-full h-full object-cover"
                                                                onLoad={(e) => URL.revokeObjectURL((e.target as any).src)}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <FileIcon className="w-8 h-8 text-blue-500 shrink-0" />
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-medium truncate">{selectedFile.name}</p>
                                                        <p className="text-[10px] text-gray-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                                                    </div>
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 rounded-full"
                                                    onClick={() => setSelectedFile(null)}
                                                >
                                                    <X className="h-3 h-3" />
                                                </Button>
                                            </div>
                                        )}

                                        {totalSizeInfo !== null && (
                                            <div className="px-1 flex justify-end items-center text-[10px]">
                                                <span className={cn(
                                                    "font-medium ",
                                                    totalSizeInfo > 60 * 1024 * 1024 ? "text-red-500" : "text-gray-400"
                                                )}>
                                                    {t('chat.usage')}: {(totalSizeInfo / 1024 / 1024).toFixed(1)} / 100 MB
                                                </span>
                                                {totalSizeInfo > 80 * 1024 * 1024 && (
                                                    <span className="text-amber-500 flex items-center gap-1">
                                                        <Loader2 className="w-2 h-2 animate-spin" />
                                                        {t('chat.limitNear')}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500">{t('chat.privacy')}</p>
                                </form>

                                {/* Email Subscription */}
                                <div className="w-full space-y-2 pt-3 mt-2">
                                    <Label className="text-xs text-gray-700 font-semibold">{t('chat.emailTitle')}</Label>
                                    <p className="text-xs text-gray-500">{t('chat.emailDesc')}</p>
                                    <div className="flex w-full gap-2 pt-1">
                                        <Input
                                            placeholder="you@example.com"
                                            type="email"
                                            className="h-8 text-xs bg-white"
                                            value={notificationEmail}
                                            onChange={(e) => setNotificationEmail(e.target.value)}
                                        />
                                        <Button size="sm" variant="outline" className="h-8 text-xs whitespace-nowrap bg-white" onClick={handleSubscribe} disabled={subscribing}>
                                            {subscribing ? "..." : t('chat.subscribe')}
                                        </Button>
                                    </div>
                                </div>
                            </CardFooter>
                        )}
                    </Card>
                )
            }





            <div className="mb-100" />


            {/* ========== Full-width Product Content Section ========== */}
            {step !== "PIN" && gift && gift.product && gift.product.detail_html && (
                <>
                    <Card className="w-full max-w-xl mb-10">
                        <CardHeader>
                            <CardTitle className="text-xl text-center">
                                {step === "FORM" ? t('titles.form') :
                                    step === "SUCCESS" ? t('titles.success') :
                                        step === "SHIPPED" ? t('titles.shipped') :
                                            step === "EXPIRED" ? t('titles.expired') :
                                                step === "COMPLETED" ? t('titles.completed') :
                                                    step === "RESTRICTED" ? tst(gift.status.toLowerCase()) : ""}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <img src={gift.product.image_url} alt="Gift" className="w-full max-h-72 object-cover rounded-xl mb-6 shadow" />
                            <h1 className="text-2xl font-bold mb-1">{gift.product.name}</h1>
                            <p className="text-gray-500 mb-6">{gift.product.description}</p>
                        </CardContent>
                    </Card>
                    <div className="w-full max-w-3xl mb-8 animate-in fade-in duration-500">
                        {/* Rich Text HTML Content — rendered in an isolated iframe so CSS cannot leak out */}
                        {gift.product.detail_html && (
                            <SandboxedHtml html={gift.product.detail_html} />
                        )}
                    </div>
                </>
            )}



        </div >
    );
}
