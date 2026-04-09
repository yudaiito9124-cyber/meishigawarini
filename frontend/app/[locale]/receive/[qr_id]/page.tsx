/**
 * ファイル概要: ダイナミック受取ページ (QRコードスキャン後)
 * 目的: スキャンされたQRコード(UUID)に基づいてギフト情報を表示し、PIN認証、受取人の住所入力、チャット機能、およびステータス管理機能を提供します。
 */
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MessageCircleQuestion, Paperclip, X, FileText, File as FileIcon, Loader2, Save, SendHorizontal, Pencil, UserPlus, Globe, Gift, User, MessagesSquare, Heart, Sparkles, Calendar, Clock, ShoppingBasket, Plus, Copy, Trash2, ChevronDown, ImageIcon, Import, Download, Package, Truck, Send, Check } from "lucide-react";
import { SiFacebook, SiInstagram, SiThreads, SiX, SiYoutube, SiLine, SiTiktok, SiLinktree, SiEight } from "@icons-pack/react-simple-icons";
import SandboxedHtml from "@/components/SandboxedHtml";
import { cn } from "@/lib/utils";
import confetti from "canvas-confetti";
import { resizeImage } from "@/lib/image-utils";
import { generateId } from "@/lib/id";
import { useRouter } from "@/i18n/routing";
import { receiveApi } from "@/lib/api/receive";
import { fetchAuthSession, getCurrentUser } from "aws-amplify/auth";
import { userApi } from "@/lib/api/user";
import { ShareDialog } from "@/components/ShareDialog";
import { useBackendError } from "@/hooks/useBackendError";


const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const GIFT_REVEAL_DELAY_MS = 750;




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

const ShakingGiftBox = ({ isShaking, isExpanding }: { isShaking?: boolean, isExpanding?: boolean }) => (
    <div className={cn(
        "flex flex-col items-center justify-center py-10 transition-all duration-700",
        isExpanding && "animate-expand"
    )}>
        <div className={cn(
            "relative w-24 h-24 mb-4 flex items-center justify-center bg-white rounded-full",
            isShaking && "animate-shake animate-bounce"
        )}>
            <Gift size={64} className={cn("text-black stroke-[1.2] stroke-black")} />
        </div>
    </div>
);

const EmptySenderInfo = (senderinfo: any) => {
    return !senderinfo || Object.keys(senderinfo).every(key => {
        if (key.startsWith("ts_")) return true;
        if (key === "import_id") return true;
        if (key === "html_image_urls") return true;
        return !senderinfo[key];
    });
};

const EmptySenderInfoWithLinks = (senderinfo: any) => {
    return !senderinfo || Object.keys(senderinfo).every(key => {
        if (key.startsWith("ts_")) return true;
        if (key === "import_id") return true;
        if (key === "html_image_urls") return true;
        if (!key.startsWith("Service_") && !key.startsWith("SNS_")) return true;
        return !senderinfo[key];
    });
};

export default function ReceivePage() {
    const t = useTranslations('ReceivePage');
    const tt = useTranslations('Time');
    const tst = useTranslations('Status');
    const { translateError } = useBackendError();
    const params = useParams();
    const router = useRouter();
    const qr_id = params?.qr_id as string;
    const locale = params?.locale as string;

    const [loading, setLoading] = useState(false);
    const [gift, setGift] = useState<any>(null);
    const [pin, setPin] = useState("");
    const [name, setName] = useState("");
    const [zip_code, setZipCode] = useState("");
    const [address, setAddress] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [email2, setEmail2] = useState("");
    const [preferred_date, setPreferredDate] = useState("");
    const [preferred_time, setPreferredTime] = useState("");

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
    const [isExpanding, setIsExpanding] = useState(false);

    // Auth & Role state
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [userRole, setUserRole] = useState<'sender' | 'receiver' | null>(null);
    const [showRoleSelection, setShowRoleSelection] = useState(false);

    // Sender Info State
    const [senderInfo, setSenderInfo] = useState<any>(null);
    const [senderInfoLoading, setSenderInfoLoading] = useState(false);
    const [isEditingSender, setIsEditingSender] = useState(false);
    const SENDER_FORM_KEYS = [
        "name", "job_title", "company", "department", "email", "phone", "phone_direct",
        "address", "HP", "memo", "SNS_Facebook", "SNS_Instagram", "SNS_Threads",
        "SNS_X", "SNS_YouTube", "SNS_LINE", "SNS_TikTok", "Service_Eight", "Service_Linktree"
    ];

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
        detail_html: "",
        card_image_url: "",
        card_image_name: "",
        html_image_urls: [] as string[],
        import_id: ""
    });
    const [htmlImageUrls, setHtmlImageUrls] = useState<string[]>([]);
    const [showDetailHtmlSection, setShowDetailHtmlSection] = useState(false);

    const updateSenderForm = (field: string, value: string) => {
        setSenderForm(prev => ({ ...prev, [field]: value }));
        if (field === 'import_id' && value.trim().startsWith('USER#') && value.includes(', SENDER')) {
            handleImportFromId(value.trim());
        }
    };

    const handleImportFromId = useCallback(async (id: string, silent: boolean = false) => {
        let importId = id.trim().replace(', SENDER', '');
        // Ensure prefix if missing
        if (!importId.startsWith('USER#')) {
            importId = `USER#${importId}`;
        }

        if (!silent) setSenderInfoLoading(true);
        try {
            const data = await receiveApi.receive_sender_load(qr_id, pin, { id: importId });
            data.sender_id = importId;
            if (data.sender_info) {
                // Sanitize: Convert null values to empty strings
                const sanitizedInfo = { ...data.sender_info };
                Object.keys(sanitizedInfo).forEach(key => {
                    if (sanitizedInfo[key] === null) sanitizedInfo[key] = "";
                });

                const cleanId = importId.replace('USER#', '').trim();
                const newInfo = {
                    ...sanitizedInfo,
                    import_id: "" // Clear on success
                };

                setSenderForm(newInfo);
                setSenderInfo({ ...newInfo, sender_id: cleanId }); // Keep sender_id in UI state to hide edit button

                if (sanitizedInfo.html_image_urls) {
                    setHtmlImageUrls(sanitizedInfo.html_image_urls);
                }

                if (!silent) alert(t('senderInfo.importSuccess'));
            }
        } catch (e: any) {
            // console.error("Import failed:", e);
            if (!silent) alert(t('senderInfo.importFailed') + ": " + (translateError(e.message, e.detail) || e.message));
        } finally {
            if (!silent) setSenderInfoLoading(false);
        }
    }, [qr_id, pin, t]);
    const [chatcontent, setChatcontent] = useState("");
    const containerRef = useRef<HTMLDivElement>(null);

    // Steps: PIN -> FORM (or SHIPPED/SUCCESS) -> RESTRICTED (if blocked)
    const [step, setStep] = useState<"PIN" | "FORM" | "SUCCESS" | "SHIPPED" | "EXPIRED" | "COMPLETED" | "RESTRICTED" | "PROMOTION">("PIN");

    const [error, setError] = useState<string | null>(null);
    const [pinError, setPinError] = useState("");

    // Check auth status
    useEffect(() => {
        const checkAuth = async () => {
            // Safari workaround: Skip hang if no obvious session hint exists
            const hasSessionHint = typeof window !== 'undefined' &&
                Object.keys(localStorage).some(key => key.startsWith('CognitoIdentityServiceProvider'));

            if (!hasSessionHint) {
                setIsLoggedIn(false);
                return;
            }

            try {
                const session = await fetchAuthSession();
                setIsLoggedIn(!!session.tokens?.idToken);
            } catch (e) {
                setIsLoggedIn(false);
            }
        };
        checkAuth();
    }, []);

    const handleVerifyPin = async (e: React.FormEvent) => {
        window.scrollTo(0, 0);
        e.preventDefault();
        setLoading(true);
        setPinError("");
        setError(null);

        try {
            // Step 1: Verify PIN (Critical Path)
            const data = await receiveApi.verify(qr_id, pin);

            // Step 2: Start loading secondary data (Background/Parallel)
            // This is non-blocking to ensure UI transition happens immediately after verification
            loadMessages().catch(err => {
                console.error("Delayed message load error:", err);
            });

            // Once verification is successful, start the expansion animation
            setIsExpanding(true);
            setGift(data);
            setHasLoadedChat(true);

            // Wait for the duration of the expansion animation (800ms)
            await new Promise(resolve => setTimeout(resolve, 1000));

            if (data.status === 'COMPLETED') {
                setShowWhiteFade(true);
            } else if (['ACTIVE', 'USED', 'SHIPPED', `RESTRICTED`, `PROMOTION`].includes(data.status) && !error) {
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
                    if (!isLoggedIn) {
                        setUserRole('receiver');
                    }
                } else if (data.status === 'EXPIRED') {
                    setStep("EXPIRED");
                } else if (data.status === 'PROMOTION') {
                    setStep("PROMOTION");
                } else {
                    setError(t('errors.inactive'));
                }
            }

        } catch (err: any) {
            // console.error(err);
            setPinError(t('errors.invalidPin'));
            setIsExpanding(false); // Reset animation if verification fails
        } finally {
            setLoading(false);
            setIsExpanding(false);
        }
    };

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            // Step 1: Verify with password (Critical Path)
            const data = await receiveApi.verify(qr_id, pin, unlockPassword);

            // Step 2: Start loading secondary data (Background/Parallel)
            loadMessages().catch(err => {
                console.error("Delayed message load error:", err);
            });

            if (data.is_authorized) {
                // Once verified and data is ready, start expansion
                setIsExpanding(true);
                setGift(data);
                setHasLoadedChat(true);

                // Wait for expansion animation duration
                await new Promise(resolve => setTimeout(resolve, 1000));

                if (data.status === 'COMPLETED') {
                    setShowWhiteFade(true);
                } else if (['ACTIVE', 'USED', 'SHIPPED'].includes(data.status) && !error) {
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
                    if (!isLoggedIn) {
                        setUserRole('receiver');
                    }
                } else if (data.status === 'EXPIRED') {
                    setStep("EXPIRED");
                }
            } else {
                setIsExpanding(false);
                alert(t('errors.invalidPassword'));
            }
        } catch (e: any) {
            setIsExpanding(false);
            alert(t('errors.unlockFailed'));
        } finally {
            setLoading(false);
            setIsExpanding(false);
        }
    };

    const handleAddressSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (step === "PROMOTION") {
            return;
        }

        const form = e.currentTarget as HTMLFormElement;

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        // この辺の処理がないとpatternに設定しているのに素通りします
        const zipDigits = zip_code.replace(/\D/g, '').length;
        const phoneDigits = phone.replace(/\D/g, '').length;

        if (zipDigits !== 7) {
            alert(t('errors.invalidZip'));
            return;
        }

        if (phoneDigits < 10 || phoneDigits > 11) {
            alert(t('errors.invalidPhone'));
            return;
        }

        if (password !== confirmPassword) {
            alert(t('errors.passwordMismatch'));
            return;
        }
        if (email !== email2) {
            alert(t('formStep.email-mismatch-error'));
            return;
        }

        setLoading(true);
        try {
            await receiveApi.receive_submit(qr_id, pin, {
                shipping_info: {
                    name,
                    address,
                    zip_code: zip_code,
                    phone,
                    email: email || undefined,
                    preferred_date: preferred_date,
                    preferred_time: preferred_time,
                    client_timestamp: new Date().toISOString(),
                },
                password
            });
            setStep("SUCCESS");
        } catch (error: any) {
            // console.error("Submission error:", error);
            alert(translateError(error.message, error.detail) || error.message || t('errors.submitFailed'));
        } finally {
            setLoading(false);
        }
    };

    const handleReceive = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await receiveApi.receive_completed(qr_id, pin, {});
            setStep("COMPLETED");
            setGift((prev: any) => ({
                ...prev,
                status: 'COMPLETED',
                ts_completed_at: prev?.ts_completed_at || new Date().toISOString()
            }));
        } catch (error: any) {
            // console.error("Receive error:", error);
            alert(translateError(error.message, error.detail) || error.message || t('errors.receiveFailed'));
        } finally {
            setLoading(false);
        }
    };

    const loadMessages = useCallback(async () => {
        try {
            // Unauthenticated users in Safari can hang on Cognito session checks (getCurrentUser/fetchAuthSession).
            // We skip these calls if we already know the user is not logged in.
            const promises: Promise<any>[] = [
                receiveApi.receive_chat_get(qr_id, pin, {})
            ];

            if (isLoggedIn) {
                promises.push(getCurrentUser().catch(() => null));
                promises.push(userApi.user_receiver_get({}).catch(() => null));
                promises.push(userApi.user_profile_get({}).catch(() => null));
            } else {
                // Return nulls for unauthenticated users to match the array destructuring
                promises.push(Promise.resolve(null));
                promises.push(Promise.resolve(null));
                promises.push(Promise.resolve(null));
            }

            const [data, authUser, receiverData, profileData] = await Promise.all(promises);

            setMessages(data.messages || []);
            setTotalSizeInfo(data.total_size_bytes || 0);

            // Pre-fill receiver info immediately if available
            if (receiverData?.receiver_info) {
                setName(prev => prev || receiverData.receiver_info.name || '');
                setZipCode(prev => prev || receiverData.receiver_info.zip_code || receiverData.receiver_info.zipCode || '');
                setAddress(prev => prev || receiverData.receiver_info.address || '');
                setPhone(prev => prev || receiverData.receiver_info.phone || '');
                setEmail(prev => prev || receiverData.receiver_info.email || '');
                setEmail2(prev => prev || receiverData.receiver_info.email || '');
            }

            // Pre-fill chat sender name based on registered personal info
            const myRegisteredName = receiverData?.receiver_info?.name || profileData?.profile?.name || '';
            if (myRegisteredName) {
                setChatName(prev => prev || myRegisteredName);
            }

            if (data.sender_id) {
                // Restoration/Auto-assign logic:
                if (authUser && authUser.userId === data.sender_id) {
                    setUserRole('sender');
                } else if (authUser) {
                    // If someone else is the sender, the logged-in user is automatically the receiver
                    setUserRole('receiver');
                }

                // Prioritize top-level sender_id
                setShowRoleSelection(false);
                handleImportFromId(data.sender_id, true);
            } else if (data.sender_info) {
                setHtmlImageUrls(data.sender_info.html_image_urls || []);
                // Sanitize: Convert null values to empty strings to avoid React warning
                const sanitizedInfo = { ...data.sender_info };
                Object.keys(sanitizedInfo).forEach(key => {
                    if (sanitizedInfo[key] === null) sanitizedInfo[key] = "";
                });
                // Set senderInfo for display
                setSenderInfo({ ...sanitizedInfo, sender_id: data.sender_id });
                setShowRoleSelection(false);
            } else {
                setSenderInfo(null);
                // Only show role selection if no sender data at all
                if (authUser) {
                    setShowRoleSelection(true);
                }
            }

            // If sender_id exists, we definitely hide selection and editing
            if (data.sender_id) {
                setShowRoleSelection(false);
                setIsEditingSender(false);
            }
        } catch (e: any) {
            console.error("Failed to load messages or user data:", e);
            alert(t('errors.loadFailed') + (translateError(e.message, e.detail) || e.message));
        }
    }, [qr_id, pin, handleImportFromId, isLoggedIn, t]);

    const handleSenderRoleSelect = async () => {
        if (!window.confirm(t('roleSelection.confirmSender'))) return;

        setLoading(true);
        try {
            // Get user profile info
            const profileData = await userApi.user_profile_get({});
            if (profileData.user_id) {
                const fullImportId = `USER#${profileData.user_id}`;
                // Register this user as the sender and update history (SENDLOG)
                await userApi.user_history_sendgift({ qr_id, pin });

                // Load the profile info from the template to display it in the UI
                await handleImportFromId(fullImportId, true);
                setUserRole('sender');
                setShowRoleSelection(false);
                if (profileData.profile?.name) {
                    setChatName(prev => prev || profileData.profile.name || '');
                }
                // Scroll to sender section
                setTimeout(() => {
                    const el = document.getElementById('sender-info-section');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                }, 100);
            }
        } catch (e: any) {
            alert(t('roleSelection.senderError'));
        } finally {
            setLoading(false);
        }
    };

    const handleReceiverRoleSelect = async () => {
        if (!window.confirm(t('roleSelection.confirmReceiver'))) return;

        setLoading(true);
        try {
            setShowRoleSelection(false);
            const data = await userApi.user_receiver_get({});
            if (data.receiver_info) {
                setName(data.receiver_info.name || '');
                setZipCode(data.receiver_info.zip_code || '');
                setAddress(data.receiver_info.address || '');
                setPhone(data.receiver_info.phone || '');
                setEmail(data.receiver_info.email || '');
                setEmail2(data.receiver_info.email || '');
                setChatName(prev => prev || data.receiver_info.name || '');
            }
            setUserRole('receiver');
        } catch (e: any) {
            // Silently fail or simple alert
            setUserRole('receiver');
        } finally {
            setLoading(false);
        }
    };

    // Toggle chat loading state if needed, or just effect.
    // Effect to reload when step changes to something other than PIN
    const [hasLoadedChat, setHasLoadedChat] = useState(false);

    useEffect(() => {
        if (step !== "PIN" && !hasLoadedChat && pin) {
            setHasLoadedChat(true);
            loadMessages();
        }
    }, [step, hasLoadedChat, pin, loadMessages]);

    // (No longer needed: prefilled in loadMessages)



    const handleChatSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if ((!chatMessage && !selectedFile) || !chatName) return;

        setChatLoading(true);
        try {
            let fileData = null;
            if (selectedFile) {
                setUploading(true);
                let uploadFile: File | Blob = selectedFile;
                let finalFilename = selectedFile.name;

                // Resize if image
                if (selectedFile.type.startsWith("image/")) {
                    try {
                        uploadFile = await resizeImage(selectedFile);
                        finalFilename = `${generateId()}.webp`; // Force WebP extension
                    } catch (err) {
                        // console.error("Resize failed, using original", err);
                    }
                }

                const { uploadUrl, fileUrl } = await receiveApi.receive_uploadurl_get(qr_id, pin, {
                    filename: finalFilename,
                    content_type: uploadFile.type,
                    file_size: uploadFile.size
                });

                const uploadRes = await fetch(uploadUrl, {
                    method: "PUT",
                    headers: { "content-type": uploadFile.type },
                    body: uploadFile
                });

                if (!uploadRes.ok) throw new Error("S3 Upload failed");

                fileData = {
                    fileUrl: fileUrl,
                    fileName: finalFilename,
                    fileType: uploadFile.type,
                    fileSize: uploadFile.size
                };
            }

            await receiveApi.receive_chat_send(qr_id, pin, {
                username: chatName,
                message: chatMessage,
                file_url: fileData?.fileUrl,
                file_name: fileData?.fileName,
                file_type: fileData?.fileType,
                file_size: fileData?.fileSize
            });
            setChatMessage("");
            setSelectedFile(null);
            await loadMessages();
        } catch (e: any) {
            alert(t('chat.sendFailed') + (translateError(e.message, e.detail) || e.message));
        } finally {
            setChatLoading(false);
            setUploading(false);
        }
    };

    const handleSenderInfoUpdate = async (fields?: any) => {
        setSenderInfoLoading(true);
        try {
            if (fields && "import_id" in fields) {
                delete fields["import_id"];
            }
            const updatedSenderInfo = {
                ...senderInfo,
                ...(fields || senderForm),
                ts_updated_at: new Date().toISOString()
            };
            // Ensure sender_id is NOT stored inside sender_info for DB optimization
            if (updatedSenderInfo.sender_id) {
                delete updatedSenderInfo.sender_id;
            }

            await receiveApi.receive_sender_update(qr_id, pin, {
                sender_info: updatedSenderInfo
            });

            await loadMessages();
            setIsEditingSender(false);
        } catch (e: any) {
            alert(t('senderInfo.updateFailed') + (translateError(e.message, e.detail) || e.message));
        } finally {
            setSenderInfoLoading(false);
        }
    };

    const handleSaveAsNewUser = async () => {
        setSenderInfoLoading(true);
        try {
            const data = await receiveApi.receive_sender_save(qr_id, pin, {
                sender_info: senderForm,
                id: senderInfo?.sender_id
            });

            // Update local state to reflect the ID so subsequent saves update the same record
            if (data.userid) {
                setSenderInfo((prev: any) => ({ ...prev, sender_id: data.userid }));
            }

            alert(t('senderInfo.exportedId', { id: data.userid }));
        } catch (e: any) {
            alert(t('senderInfo.updateFailed') + (translateError(e.message, e.detail) || e.message));
        } finally {
            setSenderInfoLoading(false);
        }
    };

    const handleHtmlImageUpload = async (file: File) => {
        if (!qr_id || !pin) return;
        setSenderInfoLoading(true);
        try {
            let uploadFile: File | Blob = file;
            let finalFilename = file.name;
            if (file.type.startsWith("image/")) {
                try {
                    uploadFile = await resizeImage(file);
                    finalFilename = `${generateId()}.webp`; // Force WebP extension
                } catch (err) {
                    // console.error("Resize failed", err);
                }
            }

            const { uploadUrl, fileUrl } = await receiveApi.receive_uploadurl_get(qr_id, pin, { filename: finalFilename, content_type: uploadFile.type, file_size: uploadFile.size });

            const s3Res = await fetch(uploadUrl, {
                method: 'PUT',
                headers: { 'content-type': uploadFile.type },
                body: uploadFile
            });
            if (!s3Res.ok) throw new Error('Failed to upload to S3');

            const strippedUrl = fileUrl.split('?')[0];
            const newUrlsForState = [...htmlImageUrls, fileUrl]; // Use signed URL for immediate preview
            const newUrlsForBackend = [...(senderForm.html_image_urls || []), strippedUrl];

            setHtmlImageUrls(newUrlsForState);

            const newSenderInfo = { ...senderForm, html_image_urls: newUrlsForBackend };
            await receiveApi.receive_sender_update(qr_id, pin, {
                sender_info: newSenderInfo
            });
            // Update local senderInfo with clean URLs for next save, but UI uses htmlImageUrls for display
            setSenderInfo(newSenderInfo);
            setSenderForm(newSenderInfo);
        } catch (e: any) {
            // console.error(e);
            alert(t('errors.uploadFailed'));
        } finally {
            setSenderInfoLoading(false);
        }
    };

    const handleRemoveSenderImage = async () => {
        if (!confirm(t('senderInfo.confirmRemoveImage'))) return;

        setSenderInfoLoading(true);
        try {
            const updatedSenderInfo = {
                ...senderInfo,
                card_image_url: "",
                card_image_name: "",
                ts_updated_at: new Date().toISOString()
            };

            await receiveApi.receive_sender_update(qr_id, pin, {
                sender_info: updatedSenderInfo
            });

            await loadMessages();
        } catch (e: any) {
            alert(t('senderInfo.removeImageFailed') + ': ' + (translateError(e.message, e.detail) || e.message));
        } finally {
            setSenderInfoLoading(false);
        }
    };

    const handleSenderInfoUpload = async (file: File) => {
        setSenderInfoLoading(true);
        try {
            let uploadFile: File | Blob = file;
            let finalFilename = file.name;
            if (file.type.startsWith("image/")) {
                try {
                    uploadFile = await resizeImage(file);
                    finalFilename = `${generateId()}.webp`; // Force WebP extension
                } catch (err) {
                    // console.error("Resize failed", err);
                }
            }

            const { uploadUrl, fileUrl } = await receiveApi.receive_uploadurl_get(
                qr_id,
                pin,
                { filename: finalFilename, content_type: uploadFile.type, file_size: uploadFile.size }
            );

            const uploadRes = await fetch(uploadUrl, {
                method: "PUT",
                headers: { "content-type": uploadFile.type },
                body: uploadFile
            });

            if (!uploadRes.ok) throw new Error("S3 Upload failed");

            const newSenderInfo = {
                ...senderForm,
                card_image_url: fileUrl,
                card_image_name: finalFilename, // fixed
                ts_updated_at: new Date().toISOString()
            };

            await receiveApi.receive_sender_update(qr_id, pin, {
                sender_info: newSenderInfo
            });

            await loadMessages();
        } catch (e: any) {
            alert(t('senderInfo.uploadCardFailed') + ': ' + (translateError(e.message, e.detail) || e.message));
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
            await receiveApi.receive_subscription(qr_id, pin, {
                email: notificationEmail,
                locale
            });
            alert(t('chat.subscribeSuccess'));
            setNotificationEmail("");
        } catch (e: any) {
            alert(t('chat.subscribeFailed') + (translateError(e.message, e.detail) || e.message));
        } finally {
            setSubscribing(false);
        }
    };

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // 入力された生の文字列
        let rawValue = e.target.value;

        // 1. まず全角を半角に変換（数字・ハイフン類）
        let converted = rawValue
            .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
            .replace(/[ー‐―－]/g, "-");

        // 2. 数字とハイフン以外を「除外」して、有効な文字だけを抽出
        // これにより、既存の数字を保持しつつ、新しく入った不正な文字だけを弾きます
        let filtered = converted.replace(/[^0-9-]/g, "");

        // 3. ハイフンの数を制限（最大2つまで）
        const parts = filtered.split("-");
        if (parts.length > 3) {
            // 3つ目以降のハイフンは結合して消す
            filtered = parts.slice(0, 3).join("-") + parts.slice(3).join("");
        }

        // 4. 数字の合計文字数を制限（最大11文字まで）
        const digitsOnly = filtered.replace(/-/g, "");
        if (digitsOnly.length > 11) {
            // 11文字を超えた場合は、入力を反映させない（以前の状態をキープ）
            return;
        }

        setPhone(filtered);
    };

    const handleZipCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // 入力された生の文字列
        let rawValue = e.target.value;

        // 1. まず全角を半角に変換（数字・ハイフン類）
        let converted = rawValue
            .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
            .replace(/[ー‐―－]/g, "-");

        // 2. 数字とハイフン以外を「除外」して、有効な文字だけを抽出
        // これにより、既存の数字を保持しつつ、新しく入った不正な文字だけを弾きます
        let filtered = converted.replace(/[^0-9-]/g, "");

        // 3. ハイフンの数を制限（最大2つまで）
        const parts = filtered.split("-");
        if (parts.length > 2) {
            // 3つ目以降のハイフンは結合して消す
            filtered = parts.slice(0, 2).join("-") + parts.slice(3).join("");
        }

        // 4. 数字の合計文字数を制限（最大11文字まで）
        const digitsOnly = filtered.replace(/-/g, "");
        if (digitsOnly.length > 7) {
            // 11文字を超えた場合は、入力を反映させない（以前の状態をキープ）
            return;
        }

        setZipCode(filtered);
    };

    useEffect(() => {
        // ページの状態に応じてbodyの背景を同期させ、オーバースクロール時の白見えを防ぐ
        const body = document.body;
        const html = document.documentElement;

        const updateStyles = () => {
            if (!containerRef.current) return;

            // レンダリングされた実際のスタイルを取得することで、Tailwindのクラスやフィルターと完全に一致させる
            const style = window.getComputedStyle(containerRef.current);
            body.style.backgroundColor = style.backgroundColor;
            html.style.backgroundColor = style.backgroundColor;
            body.style.filter = style.filter;
        };

        // 初回と、step変更による再レンダリング後に実行
        updateStyles();

        // 念のため少し遅延させて再実行（トランジション対応）
        const timer = setTimeout(updateStyles, 100);

        return () => {
            clearTimeout(timer);
            body.style.backgroundColor = "";
            html.style.backgroundColor = "";
            body.style.filter = "";
        };
    }, [step]);

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

    return (
        <div ref={containerRef} className={cn("min-h-screen w-full bg-gray-50 flex flex-col items-center justify-center py-8 px-4 transition-all duration-1000", step === "COMPLETED" && "bg-olive-300 sepia-[.2] shadow-[inset_0_0_500px_rgba(0,0,0,0.8)]")}>


            {/* COMPLETEしているカードを読み込む際のフェード処理 */}
            {showWhiteFade && (
                <div
                    className="fixed inset-0 z-[100] bg-olive-800 animate-fade-out-white pointer-events-none"
                    onAnimationEnd={() => setShowWhiteFade(false)}
                />
            )}



            {/* Login Encouragement Banner */}
            {!isLoggedIn && (step === "PIN" || step === "FORM") && (
                <div className="w-full max-w-xl mb-6">
                    <Card className="bg-blue-50 border-blue-200 shadow-sm border-dashed">
                        <CardContent className="p-4 py-3 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white rounded-full">
                                    <UserPlus className="w-4 h-4 text-blue-500" />
                                </div>
                                <p className="text-xs text-blue-700 font-medium">
                                    {t('loginEncouragement')}
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs bg-white text-blue-600 border-blue-200 hover:bg-blue-100"
                                onClick={() => router.push('/login')}
                            >
                                {t('loginEncouragementButton')}
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            )}





            {/* Memory Section */}
            {step === "COMPLETED" && gift && (
                <div className="w-full max-w-xl mt-20 mb-30 overflow-hidden relative bg-mauve-100/40 rounded-xl shadow-sm">
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
                                        {t('memorySection.submittedAt', { date: gift.ts_submitted_at ? new Date(gift.ts_submitted_at).toLocaleDateString() : "-" })}
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
                                        {t('memorySection.receivedAt', { date: gift.ts_completed_at ? new Date(gift.ts_completed_at).toLocaleDateString() : "-" })}
                                    </div>
                                </div>
                            </div>

                        </CardContent>
                    </Card>
                </div>
            )}












            {/* ========== Animated Product Card Section ========== */}
            <Card className="w-full max-w-xl">
                {!(step === "PIN" && (loading || isExpanding)) && (
                    <CardHeader>
                        <CardTitle className="text-xl text-center">
                            {step === "PIN" ? t('titles.pin') :
                                step === "RESTRICTED" ? tst(gift?.status?.toLowerCase() || 'active') : ""}
                        </CardTitle>
                    </CardHeader>
                )}
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
                            0% { transform: scale(0.8) translateY(20px); opacity: 0; }
                            100% { transform: scale(1) translateY(0); opacity: 1; }
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
                        @keyframes expand-gift {
                            0% { transform: scale(1); opacity: 1; }
                            100% { transform: scale(50); opacity: 0; } // 拡大アニメーションの拡大率
                        }
                        .animate-expand {
                            animation: expand-gift 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards;
                        }
                    `}} />

                    {(isExpanding || ((loading || step === "PIN" || step === "RESTRICTED") && !gift?.product)) && (
                        <ShakingGiftBox isShaking={loading && !isExpanding} isExpanding={isExpanding} />
                    )}

                    {!loading && step !== "PIN" && gift && gift.product && (
                        <div className="animate-reveal space-y-4">
                            {/* Hero Image */}
                            <div className="relative mb-6 overflow-hidden rounded-xl shadow-2xl group border-4 border-white/50">
                                <img
                                    src={gift.product.image_url}
                                    onClick={() => step === "PROMOTION" && window.open('https://meishigawarini.com', '_blank')}
                                    alt="Gift"
                                    className={cn("w-full object-contain max-h-260 object-cover transform transition-transform duration-700 group-hover:scale-105", step === "PROMOTION" ? "cursor-pointer" : "cursor-default")}
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
                            <h1 className="relative z-20 text-4xl font-extrabold mb-1 text-center text-black drop-shadow-sm mt-18">
                                {gift.product.name}
                            </h1>
                            <p className="text-gray-600 italic leading-relaxed text-center mb-15">{gift.product.description}</p>

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


                            {/* 有効期限 */}

                            <div className="pr-8 pl-8">
                                {/* Remaining Days for Active Gift */}
                                {step === "FORM" && gift.ts_expired_at && (
                                    <div className="border border-red-400 bg-orange-50 p-3 rounded text-center rounded-xl border-dashed border-2">
                                        <p className="text-sm font-semibold text-red-600 ">
                                            {t('daysRemaining', getRemainingTime(gift.ts_expired_at)!)}
                                        </p>
                                        <p className="text-sm text-center text-gray-500 mt-1">
                                            {t('limitdatetime', { datetime: new Date(gift.ts_expired_at).toLocaleString() })}
                                        </p>
                                    </div>
                                )}

                                {/* Expired Message */}
                                {step === "EXPIRED" && (
                                    <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl text-center">
                                        <p className="text-red-600 font-bold">{t('expiredStep.message')}</p>
                                        <p className="text-red-500 text-sm mt-1">{t('expiredStep.subMessage', { date: gift.ts_expired_at ? new Date(gift.ts_expired_at).toLocaleDateString() : "-" })}</p>
                                    </div>
                                )}

                            </div>

                        </div>
                    )}



                    {!(loading || isExpanding) && step === "PIN" && !gift?.product && (
                        <form onSubmit={handleVerifyPin} className={cn("transition-opacity", loading && "opacity-50 pointer-events-none")}>
                            <div className="space-y-2 p-4 rounded-lg">
                                <Label htmlFor="pin" className="font-semibold justify-center">{t('pinStep.label')}</Label>
                                <Input
                                    id="pin"
                                    type="text"
                                    placeholder={t('pinStep.placeholder')}
                                    value={pin}
                                    disabled={loading}
                                    className="text-center items-center h-12"
                                    onChange={(e) => {
                                        setPin(e.target.value);
                                        setPinError("");
                                    }}
                                    // ↓ ここを追加：デザインを維持しつつ、入力後に等倍へ戻すハック
                                    onBlur={() => {
                                        const viewport = document.querySelector('meta[name="viewport"]');
                                        if (viewport) {
                                            viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0');
                                            setTimeout(() => {
                                                // ユーザーが手動でズームできるように制限を戻す
                                                viewport.setAttribute('content', 'width=device-width, initial-scale=1.0');
                                            }, 300);
                                        }
                                    }}
                                    // iOSの自動ズームを防ぐために、インラインスタイルで16pxを強制するのも有効です
                                    style={{ fontSize: '30px' }}
                                />
                                {pinError && <p className="text-sm text-red-500">{pinError}</p>}
                            </div>
                            <div className="mr-4 ml-4 pt-6">
                                <Button type="submit" className="flex w-full h-14" disabled={loading || !pin}>
                                    {loading ? t('pinStep.verifying') : t('pinStep.submit')}
                                </Button>
                            </div>
                        </form>
                    )}
                </CardContent>
            </Card>







            {showRoleSelection && step === "FORM" && (
                <Card className="w-full max-w-xl mt-12 border shadow-2xl shadow-emerald-500/40 bg-white/95 backdrop-blur-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-700 ring-1 ring-emerald-500/10">
                    <CardHeader className="pb-4 pt-8 text-center">
                        {/* <div className="mx-auto w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mb-6 ring-4 ring-emerald-50/50">
                            <Sparkles className="w-6 h-6 text-emerald-500 animate-pulse" />
                        </div> */}
                        <CardTitle className="text-2xl font-bold tracking-tight text-emerald-600">
                            {t('titles.selectRole')}
                        </CardTitle>
                        <p className="text-sm text-gray-500 mt-2 max-w-[80%] mx-auto leading-relaxed">
                            {t('roleSelection.description')}
                        </p>
                    </CardHeader>
                    <CardContent className="px-6 pb-10 space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Receiver Role Button */}
                            <button
                                type="button"
                                onClick={handleReceiverRoleSelect}
                                disabled={loading}
                                className={cn(
                                    "relative h-44 flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 transition-all duration-300 group",
                                    userRole === 'receiver'
                                        ? "border-black bg-gray-50 ring-4 ring-gray-100"
                                        : "border-gray-100 hover:border-black hover:bg-white hover:shadow-lg hover:scale-[1.02] bg-gray-50/30"
                                )}
                            >
                                {userRole === 'receiver' && (
                                    <div className="absolute top-3 right-3 bg-black rounded-full p-1 shadow-sm">
                                        <Check className="w-3 h-3 text-white" />
                                    </div>
                                )}
                                <div className={cn(
                                    "p-4 rounded-xl transition-colors duration-300",
                                    userRole === 'receiver' ? "bg-black text-white" : "bg-white text-gray-400 group-hover:text-black group-hover:bg-gray-50 shadow-sm"
                                )}>
                                    <Gift className="w-8 h-8" />
                                </div>
                                <div className="text-center">
                                    <span className={cn(
                                        "block font-bold text-lg mb-1",
                                        userRole === 'receiver' ? "text-black" : "text-gray-700"
                                    )}>
                                        {t('roleSelection.receiver')}
                                    </span>
                                    <span className="text-[10px] text-gray-400 font-medium leading-tight block">
                                        {t('roleSelection.receiverDescription')}
                                    </span>
                                </div>
                            </button>

                            {/* Sender Role Button */}
                            <button
                                type="button"
                                onClick={handleSenderRoleSelect}
                                disabled={loading}
                                className={cn(
                                    "relative h-44 flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 transition-all duration-300 group",
                                    userRole === 'sender'
                                        ? "border-black bg-gray-50 ring-4 ring-gray-100"
                                        : "border-gray-100 hover:border-black hover:bg-white hover:shadow-lg hover:scale-[1.02] bg-gray-50/30"
                                )}
                            >
                                {userRole === 'sender' && (
                                    <div className="absolute top-3 right-3 bg-black rounded-full p-1 shadow-sm">
                                        <Check className="w-3 h-3 text-white" />
                                    </div>
                                )}
                                <div className={cn(
                                    "p-4 rounded-xl transition-colors duration-300",
                                    userRole === 'sender' ? "bg-black text-white" : "bg-white text-gray-400 group-hover:text-black group-hover:bg-gray-50 shadow-sm"
                                )}>
                                    <Send className="w-8 h-8" />
                                </div>
                                <div className="text-center">
                                    <span className={cn(
                                        "block font-bold text-lg mb-1",
                                        userRole === 'sender' ? "text-black" : "text-gray-700"
                                    )}>
                                        {t('roleSelection.sender')}
                                    </span>
                                    <span className="text-[10px] text-gray-400 font-medium leading-tight block">
                                        {t('roleSelection.senderDescription')}
                                    </span>
                                </div>
                            </button>
                        </div>

                        {/* Global Loading Overlay for Role Selection */}
                        {loading && (
                            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-30 flex flex-col items-center justify-center animate-in fade-in duration-300">
                                <div className="p-10 flex flex-col items-center gap-4 text-center">
                                    <div className="relative">
                                        <Loader2 className="w-12 h-12 text-black animate-spin" />
                                        <div className="absolute inset-0 border-4 border-gray-100 rounded-full opacity-25" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="font-bold text-gray-800 text-lg">{t('roleSelection.processing')}</p>
                                        <p className="text-xs text-gray-500 font-medium">{t('roleSelection.processingDescription')}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* --- Form Section --- */}
            {(!showRoleSelection && ["FORM", "PROMOTION"].includes(step)) && (
                <Card className="w-full max-w-xl mt-12 border shadow-2xl shadow-emerald-500/40 bg-white/95 backdrop-blur-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-700 ring-1 ring-emerald-500/10">
                    <CardHeader className="pb-4 pt-8 text-center">
                        {/* <div className="mx-auto w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mb-6 ring-4 ring-emerald-50/50">
                            <Sparkles className="w-6 h-6 text-emerald-500 animate-pulse" />
                        </div> */}
                        <CardTitle className="text-2xl font-bold tracking-tight text-emerald-600">
                            {
                                step === "FORM" || step === "PROMOTION" ? t('titles.form') + (step === "PROMOTION" ? " (sample)" : "") : ""}
                        </CardTitle>
                    </CardHeader>

                    <CardContent>


                        {(step === "FORM" || step === "PROMOTION") && (
                            <form onSubmit={handleAddressSubmit} className="space-y-6 space-y-4 p-8">
                                {/* <Label className="font-semibold">{t('formStep.title')}</Label> */}
                                <div className="space-y-2">
                                    <Label htmlFor="name">{t('formStep.name')}</Label>
                                    <Input
                                        id="name"
                                        required
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder={t('formStep.name-placeholder')}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="zip_code">{t('formStep.zip_code')}</Label>
                                    <Input
                                        id="zip_code"
                                        required
                                        value={zip_code}
                                        pattern="^(?=([^0-9]*[0-9]){7}[^0-9]*$)[0-9\-]*$"
                                        onChange={handleZipCodeChange}
                                        placeholder={t('formStep.zip_code-placeholder')}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="address">{t('formStep.address')}</Label>
                                    <Input
                                        id="address"
                                        required
                                        value={address}
                                        onChange={(e) => setAddress(e.target.value)}
                                        placeholder={t('formStep.address-placeholder')}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="phone">{t('formStep.phone')}</Label>
                                    <Input
                                        id="phone"
                                        required
                                        type="tel"
                                        value={phone}
                                        pattern="^(?=([^0-9]*[0-9]){10,11}[^0-9]*$)[0-9\-]*$"
                                        onChange={handlePhoneChange}
                                        placeholder={t('formStep.phone-placeholder')}
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
                                        // pattern="^[a-zA-Z0-9.!#$%&'*+\\/=?^_`\\{\\|\\}~\\-]+@[a-zA-Z0-9\\-]+(?:\\.[a-zA-Z0-9\\-]+)*$"
                                        placeholder={t('formStep.email-placeholder')}
                                    />
                                    {email && (
                                        <Input
                                            id="email2"
                                            type="email"
                                            value={email2}
                                            onPaste={(e) => e.preventDefault()}
                                            required={!!email}
                                            onChange={(e) => setEmail2(e.target.value)}
                                            pattern={email ? email.replace(/[.*+?^${}()|[\]\\/\-]/g, '\\$&') : undefined}
                                            title={t('formStep.email-mismatch-error')}
                                            placeholder={t('formStep.email-confirm-placeholder')}
                                        />
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="preferred_date">{t('formStep.preferred_date')}</Label>
                                    <div className="flex gap-2 items-start h-9">
                                        <div className="flex-1 flex h-full items-center justify-center">
                                            <Input
                                                id="preferred_date"
                                                type="date"
                                                value={preferred_date}
                                                onChange={(e) => setPreferredDate(e.target.value)}
                                                className="w-full h-full"
                                            />
                                            {/* {preferred_date && (
                                                    <p className="text-[10px] text-blue-600 font-bold ml-1 animate-in fade-in slide-in-from-top-1">
                                                        {(() => {
                                                            try {
                                                                const [y, m, d] = preferred_date.split('-').map(Number);
                                                                const date = new Date(y, m - 1, d);
                                                                if (isNaN(date.getTime())) return "";
                                                                    const weekday = date.toLocaleDateString(params?.locale as string || 'ja-JP', { weekday: 'short' });
                                                                    return `(${weekday})`;
                                                                } catch (e) {
                                                                    return "";
                                                                }
                                                            })()}
                                                        </p>
                                                    )} */}
                                        </div>
                                        <div className="flex h-full items-center justify-center">

                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() => setPreferredDate("")}
                                                className="flex whitespace-nowrap h-full items-center justify-center"
                                            >
                                                {t('formStep.noPreference')}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="preferred_time">{t('formStep.preferred_time')}</Label>
                                    <select
                                        id="preferred_time"
                                        value={preferred_time}
                                        onChange={(e) => setPreferredTime(e.target.value)}
                                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <option value="">{t('formStep.noPreference')}</option>
                                        <option value="timeMorning">{tt('timeMorning')}</option>
                                        <option value="time1416">{tt('time1416')}</option>
                                        <option value="time1618">{tt('time1618')}</option>
                                        <option value="time1820">{tt('time1820')}</option>
                                        <option value="time1921">{tt('time1921')}</option>
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


                                <Button type="submit" className="w-full flex flex-row items-center justify-center h-12 mt-14" disabled={loading}>
                                    {loading ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <SendHorizontal className="mr-2 h-4 w-4" />
                                    )}
                                    {loading ? t('formStep.submitting') : t('formStep.submit')}
                                </Button>
                                <p className="text-xs text-gray-500 text-center">{t('formStep.privacyPolicy')}</p>
                            </form>
                        )}

                    </CardContent>
                </Card>
            )
            }

            {/* --- Notification Section --- */}
            {
                (["SUCCESS", "SHIPPED", "EXPIRED", "RESTRICTED"].includes(step)) && (
                    <Card className="w-full max-w-xl mt-20">
                        <CardHeader>
                            <CardTitle className="text-xl text-center">
                                {/* <Label className="text-xl text-center flex flex-col text-gray-500"> */}
                                {
                                    step === "SUCCESS" ? t('titles.success') :
                                        step === "SHIPPED" ? t('titles.shipped') :
                                            step === "EXPIRED" ? t('titles.expired') :
                                                step === "COMPLETED" ? t('titles.completed') :
                                                    ""}
                                {/* </Label>
                            {step === "PIN" ? t('titles.pin') :
                                step === "RESTRICTED" ? tst(gift.status.toLowerCase()) : ""} */}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>



                            {/* パスワード設定時のパスワード入力フォーム */}
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

                            {step === "SUCCESS" && (
                                <div className="text-center py-6 space-y-4">
                                    {/* <p className="text-green-600 font-medium">{t('successStep.message')}</p> */}
                                    <p className="text-sm text-gray-500">{t('successStep.subMessage')}<br />{t('successStep.subMessage2')}</p>
                                </div>
                            )}

                            {step === "SHIPPED" && gift && (
                                <div className="text-center py-6 space-y-4">
                                    {/* <p className="text-green-600 font-medium">{t('shippedStep.message')}</p> */}

                                    {gift.delivery_company && (
                                        <p className="text-sm text-gray-500">{t('shippedStep.deliveryCompany', { company: gift.delivery_company })}</p>
                                    )}
                                    {gift.tracking_number && (
                                        <p className="text-sm text-gray-500">{t('shippedStep.tracking', { number: gift.tracking_number })}</p>
                                    )}
                                    <hr className="my-10 border-gray-200" />

                                    <p className="text-gray-600 text-sm">{t('shippedStep.receivedMessage')}</p>
                                    <Button type="submit" className="w-full h-12" variant="default" onClick={handleReceive} disabled={loading}>
                                        {loading ? t('shippedStep.submitting') : t('shippedStep.receivedButton')}
                                    </Button>

                                </div>
                            )}

                            {step === "COMPLETED" && gift && (
                                <div />
                                // <div className="text-center py-6 space-y-4">
                                //     <p className="text-green-600 font-medium">{t('shippedStep.compleatedMessage')}</p>
                                // </div>
                            )}
                            {(step === "SUCCESS" || step === "SHIPPED") && (
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
                                                        {qr_id}
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



                            {/* SNS Share Button - Witty Place */}
                            {!["PIN", "EXPIRED"].includes(step) && (

                                <div className="w-full max-w-xl mt-12 pr-6 pl-6 animate-reveal reveal-delay-500">
                                    <ShareDialog
                                        qr_id={qr_id}
                                        product={{ name: gift.product.name, image_url: gift.product.image_url }}
                                        card={{ image_url: gift.design?.thumbf || gift.thumbf || gift.card_image_url }}
                                        shop={{ name: gift.shop_name }}
                                    />
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )
            }


            {/* Sender Info Section */}
            {
                // 送り主情報を追加するボタン
                (step === "FORM" && !isLoggedIn && !isEditingSender && EmptySenderInfo(senderInfo) && gift?.status === 'ACTIVE') && (
                    <div>
                        <Card className="w-full max-w-xl mt-20 flex flex-col items-center justify-center cursor-pointer p-6 border-3 border-dashed border-black-100 rounded-xl bg-gray-50/50 hover:bg-blue-200/50  hover:border-blue-200 transition-colors"
                            onClick={() => {
                                if (gift?.status !== 'ACTIVE') {
                                    alert(t('senderInfo.onlyActive'));
                                    return;
                                }
                                setIsEditingSender(!isEditingSender);
                            }}
                        >
                            {/* <CardHeader className="w-full flex flex-col items-center justify-center cursor-pointer p-6 border border-dash rounded-xl bg-gray-50/50 hover:bg-white transition-colors"> */}
                            <CardTitle className="text-xl text-center flex items-center justify-center gap-2">
                                <UserPlus className="w-5 h-5 text-gray-600" />
                                {t('senderInfo.title-empty')}
                            </CardTitle>
                            {/* </CardHeader> */}
                        </Card>
                    </div>
                )
            }
            {
                // 送り主情報を閲覧・編集
                (isEditingSender || !EmptySenderInfo(senderInfo)) ? (
                    <Card id="sender-info-section" className="w-full max-w-xl mt-20 flex flex-col">
                        <CardHeader className="flex justify-between items-center">
                            <CardTitle className="text-xl text-center flex items-center justify-left gap-2">
                                <User className="w-5 h-5 text-gray-600" />
                                {t('senderInfo.title')}
                            </CardTitle>
                            <div className="flex flex-row items-center">
                                {(senderInfo && senderInfo.ts_updated_at) && (
                                    <span className="text-[10px] text-gray-400 flex items-center">
                                        {new Date(senderInfo.ts_updated_at).toLocaleString()} {t('senderInfo.updated')}
                                    </span>
                                )}
                                {(senderInfo && step === "FORM" && !senderInfo.sender_id) ? (
                                    <div className="flex items-center flex items-center">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-10 w-10 text-gray-400 hover:text-gray-600"
                                            onClick={() => {
                                                if (gift?.status !== 'ACTIVE') {
                                                    alert(t('senderInfo.onlyActive'));
                                                    return;
                                                }
                                                setIsEditingSender(!isEditingSender);
                                            }}
                                        >
                                            {isEditingSender ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                                        </Button>
                                    </div>
                                ) : ""}
                            </div>
                        </CardHeader>
                        <CardContent className="min-h-0 flex flex-col animate-in fade-in slide-in-from-bottom-2 relative group/card p-0">

                            {/* 編集箇所 */}
                            {(step === "FORM" && isEditingSender) ? (
                                <div className="space-y-6 p-6">
                                    <div className="w-full flex items-center justify-center text-xs text-center text-gray-500">
                                        {t('senderInfo.description')}
                                    </div>
                                    <div
                                        className="aspect-[1.6/1] w-full flex flex-col items-center justify-center gap-3 cursor-pointer p-6 border rounded-xl bg-gray-50/50 hover:bg-white transition-colors"
                                        onClick={() => document.getElementById('senderCardUpload')?.click()}
                                    >

                                        {senderInfo?.card_image_url && (
                                            <div className="relative w-full h-full">
                                                <img
                                                    src={senderInfo.card_image_url}
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
                                                            value={(senderForm as any)[field] || ""}
                                                            onChange={(e) => updateSenderForm(field, e.target.value)}
                                                            disabled={senderInfoLoading}
                                                            className="min-h-[80px] text-sm"
                                                            placeholder={t(`senderInfo.labels.${field}`)}
                                                        />
                                                    ) : (
                                                        <Input
                                                            id={`sender-${field}`}
                                                            value={(senderForm as any)[field] || ""}
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
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => {
                                                            const link = document.createElement('a');
                                                            link.href = '/prompts/landing-page-prompt.md';
                                                            link.download = 'landing-page-prompt.md';
                                                            link.click();
                                                        }}
                                                        className="h-7 px-2 text-[10px] gap-1 bg-white border-green-200 text-green-600 hover:bg-green-50 hover:text-green-700 hover:border-green-300"
                                                    >
                                                        <Download className="w-3 h-3" />
                                                        {t('senderInfo.labels.detail_html-downloadPrompt')}
                                                    </Button>
                                                </div>
                                                <div className="md:col-span-2 flex flex-col w-full items-center gap-2 space-y-1.5 p-0 mb-3">
                                                    <div className="md:col-span-1 w-full flex flex-col px-6 space-y-1 p-0 pr-0 pl-0">
                                                        <Textarea
                                                            id={`sender-detail_html`}
                                                            value={(senderForm as any)["detail_html"] || ""}
                                                            onChange={(e) => updateSenderForm("detail_html", e.target.value)}
                                                            disabled={senderInfoLoading}
                                                            className="min-h-[80px] text-sm"
                                                            placeholder={t(`senderInfo.labels.detail_html-placeholder`)}
                                                        />
                                                    </div>

                                                    {/* HTML Images Section */}
                                                    <div className="md:col-span-1 flex flex-col px-6 space-y-1 p-0 pr-0 pl-0">
                                                        <div className="flex items-center justify-center">
                                                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                                                <ImageIcon className="w-3 h-3 text-blue-500" />
                                                                {t(`senderInfo.labels.detail_html-images`)}
                                                            </span>
                                                        </div>
                                                        <div className="space-y-2">
                                                            {htmlImageUrls.length === 0 ? (
                                                                <p className="text-[10px] text-gray-400 italic font-medium py-2">{t('senderInfo.labels.detail_html-noimages')}</p>
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
                                                                                    onClick={() => {
                                                                                        if (!confirm(t('senderInfo.confirmRemoveImage'))) return;
                                                                                        const deletedUrl = htmlImageUrls[idx];
                                                                                        const next = htmlImageUrls.filter((_, i) => i !== idx);
                                                                                        setHtmlImageUrls(next);
                                                                                        const newSenderInfo = { ...senderForm, html_image_urls: next };
                                                                                        fetch(`${NEXT_PUBLIC_API_URL}/receive/chat`, {
                                                                                            method: 'POST',
                                                                                            headers: { "content-type": "application/json" },
                                                                                            body: JSON.stringify({
                                                                                                type: 'update_sender_info',
                                                                                                pin,
                                                                                                sender_info: newSenderInfo,
                                                                                                deleted_html_image_urls: [deletedUrl]
                                                                                            })
                                                                                        });
                                                                                        setSenderInfo(newSenderInfo);
                                                                                        setSenderForm(newSenderInfo);
                                                                                    }}
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
                                                            className="h-7 text-[10px] gap-1 px-2 border-dashed bg-blue-50/50 hover:bg-blue-50 text-blue-600 border-blue-200"
                                                            onClick={() => (document.getElementById('htmlImageUpload') as HTMLInputElement)?.click()}
                                                        >
                                                            <Plus className="w-3 h-3" />
                                                            {t(`senderInfo.labels.detail_html-addimage`)}
                                                        </Button>
                                                        <div className="bg-blue-50/50 p-2.5 rounded-lg border border-blue-100/50">
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


                                                {/* Export / Import Section */}
                                                <Label className="text-xs font-bold text-gray-600 flex items-center gap-1 mt-6 pb-0 border-t">
                                                    {t(`senderInfo.labels.import_label`)}
                                                </Label>
                                                <div className="md:col-span-2 flex items-center gap-2 space-y-1.5 p-3 mb-3 pt-0">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        className="border-blue-200 text-gray-600"
                                                        onClick={() => handleSaveAsNewUser()}
                                                        disabled={senderInfoLoading}
                                                    >
                                                        {senderInfoLoading ? <Loader2 className="w-2 h-2 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                                    </Button>
                                                    <Input
                                                        id="sender-import_id"
                                                        value={senderForm.import_id}
                                                        onChange={(e) => updateSenderForm("import_id", e.target.value)}
                                                        disabled={senderInfoLoading}
                                                        className="h-9 text-sm bg-white"
                                                        placeholder={t(`senderInfo.labels.import_id`)}
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        className="border-blue-200 text-gray-600"
                                                        onClick={() => handleImportFromId(senderForm.import_id)}
                                                        disabled={senderInfoLoading || !senderForm.import_id}
                                                    >
                                                        {senderInfoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Import className="h-4 w-4" />}
                                                    </Button>
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
                                            {isEditingSender && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    onClick={() => setIsEditingSender(false)}
                                                >
                                                    {t('senderInfo.cancel')}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="mt-20 border-b" />
                                    <Label className="w-full flex flex-col text-center text-xl border border-blue-100 border-3 border-dashed rounded-xl">{t('senderInfo.preview')}</Label>
                                </div>
                            ) : ""}

                            {/* 実際に表示する箇所 */}
                            {senderInfo ? (
                                <div className="w-full">

                                    {/* HTML Detail */}
                                    {senderInfo.detail_html && (
                                        <CardContent className="min-h-0 flex flex-1 w-full mb-6"> {/* w-fullを追加 */}
                                            <div className="w-full mt-0 relative rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-white">
                                                {/* コンテンツ */}
                                                <SandboxedHtml html={senderInfo.detail_html} />
                                                {/* Overly to "gather" the corners */}
                                                <div className="absolute inset-0 pointer-events-none rounded-2xl ring-1 ring-black/5 ring-inset" />
                                            </div>
                                        </CardContent>
                                    )}

                                    <div className="mr-8 ml-8">
                                        {/* 名刺画像・顔写真 */}
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
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 ml-6 mr-6">
                                            {SENDER_FORM_KEYS.map((field) => {
                                                const value = (senderForm as any)[field];
                                                return value &&
                                                    field == "name" && (
                                                        <div key={field} className={cn("flex flex-col border-b border-gray-50 pb-2 sm:col-span-2")}>
                                                            <span className="text-[10px] font-bold text-gray-400 uppercase">
                                                                {t(`senderInfo.labels.${field}`)}
                                                            </span>
                                                            <span className={cn("text-gray-800 break-words whitespace-pre-wrap text-xl font-bold")}>
                                                                {value}
                                                            </span>
                                                        </div>
                                                    );
                                            })}
                                        </div>
                                        {/* 名前・LINK以外(メール・住所・電話番号・ホームページ等) */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 ml-6 mr-6">
                                            {SENDER_FORM_KEYS.map((field) => {
                                                const value = (senderForm as any)[field];
                                                return value &&
                                                    field !== 'card_image_url' &&
                                                    field !== 'card_image_name' &&
                                                    field !== 'ts_updated_at' &&
                                                    field !== 'ts_created_at' &&
                                                    field !== 'name' &&
                                                    field !== 'detail_html' &&
                                                    field !== 'import_id' &&
                                                    field !== 'sender_id' &&
                                                    field !== 'html_image_urls' &&
                                                    typeof value === 'string' &&
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
                                                    );
                                            })}
                                        </div>


                                        {/* LINK(SNS/Webサービスリンク) */}
                                        {!EmptySenderInfoWithLinks(senderInfo) && (
                                            <div className="gap-1 ml-6 mr-6">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase">
                                                    LINK
                                                </span>
                                                <div className="flex flex-wrap gap-1">
                                                    {SENDER_FORM_KEYS.map((field) => {
                                                        const value = (senderForm as any)[field];
                                                        return value && (field.startsWith("SNS_") || field.startsWith("Service_")) ? (
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
                                                        ) : "";
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>




                                </div>
                            ) : ""}

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
                                    if (file) handleSenderInfoUpload(file);
                                    e.target.value = "";
                                }}
                            />
                            {/* --------------------------- */}
                        </CardContent>
                    </Card>
                ) : ""
            }


            {/* Chat Section */}
            {
                step !== "PIN" && (
                    <Card className={cn("w-full max-w-xl mt-20 flex flex-col", step !== "COMPLETED" && "max-h-[calc(100vh-12rem)] min-h-[800px] overflow-hidden")}>

                        <CardHeader className=" items-center">
                            <CardTitle className="text-xl text-center flex items-center justify-left gap-2">
                                <MessagesSquare className="w-5 h-5 text-gray-600" />
                                {t('chat.title')}
                            </CardTitle>
                        </CardHeader>

                        <CardContent className="min-h-0 flex flex-1">
                            <div className={cn("flex-1 min-h-0 flex flex-col pt-0 pb-0 overflow-y-auto space-y-2 rounded-xl", step !== "COMPLETED" && "bg-gray-100 border shadow-sm")} >
                                {messages.length === 0 ? (
                                    <p className="text-sm text-gray-500 text-center py-4">{t('chat.noMessages')}</p>
                                ) : (
                                    messages.slice().map((msg, index) => {
                                        const isSystem = msg.username === 'System';
                                        const displayUsername = isSystem ? t('chat.system') : msg.username;
                                        const displayMessage = (isSystem && msg.message === 'DeliveryCompleted')
                                            ? t('chat.systemMessage.deliveryCompleted')
                                            : msg.message;

                                        return (
                                            <div key={msg.id || msg.ts_created_at || index} className={`${isSystem ? 'bg-blue-50 border-blue-100' : ''} p-2 rounded-xl text-sm ${msg.username === chatName ? 'ml-10' : 'mr-10'}`}>
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
                                                                <video
                                                                    src={msg.file_url}
                                                                    controls
                                                                    className="max-h-64 max-w-full rounded-xl overflow-hidden shadow-sm bg-black/90 aspect-video flex items-center justify-center mx-auto"
                                                                    playsInline
                                                                >
                                                                    {t('chat.videoUnsupported')}
                                                                </video>
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
                        {/*　チャットの送信セクション (カードの状態が受け渡し完了になる前まで入力可能) */}
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


            {/* ========== ショップの紹介セクション ========== */}
            {
                step !== "PIN" && gift && (gift.shop_detail_html) && (
                    <Card className="w-full mt-20 flex flex-col items-center max-w-xl bg-white ">
                        <CardTitle className="w-full flex flex-col items-center justify-center gap-2">
                            <div className="w-full flex items-center justify-center text-xl text-center gap-2">
                                <ShoppingBasket className="w-5 h-5 text-gray-600" />
                                {t('shopinfo')}
                            </div>
                            <div className="w-full flex items-center justify-center text-xs text-center text-gray-500">
                                {t('shopinfo_description')}
                            </div>
                        </CardTitle>
                        <CardContent className="min-h-0 flex flex-1 p-0 w-full p-4"> {/* w-fullを追加 */}
                            <div className="w-full mt-0 mr-0 ml-0 p-0 relative rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-white">
                                {/* コンテンツ */}
                                <SandboxedHtml html={gift.shop_detail_html} />
                                {/* Overly to "gather" the corners */}
                                <div className="absolute inset-0 pointer-events-none rounded-2xl ring-1 ring-black/5 ring-inset" />
                            </div>
                        </CardContent>
                    </Card>
                )
            }



        </div >
    );
}
