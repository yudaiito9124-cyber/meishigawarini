"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Inbox, ChevronDown, ExternalLink } from "lucide-react";
import { userApi } from "@/lib/api/user";

export default function ReceivedHistoryPage() {
    const t = useTranslations('UserProfilePage');
    const params = useParams();
    const router = useRouter();
    const userId = params?.userid as string;

    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState<Array<{ uuid: string, timestamp: string }>>([]);

    const fetchHistory = useCallback(async () => {
        setLoading(true);
        try {
            const data = await userApi.user_history_get({});
            setHistory(data.received || []);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    return (
        <div className="min-h-screen bg-mist-50 flex flex-col items-center py-12 px-4">
            <Card className="w-full max-w-2xl shadow-xl border-none bg-white/80 backdrop-blur-md rounded-3xl overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-purple-500 to-indigo-600 p-8 text-white flex flex-col gap-4">
                    <div className="flex justify-between items-start">
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-white hover:bg-white/20 -ml-2 h-8"
                            onClick={() => window.location.href = `/user/${userId}`}
                        >
                            <ChevronDown className="h-4 w-4 mr-1 rotate-90" /> {t('back')}
                        </Button>
                    </div>
                    <div className="flex flex-row items-center gap-4">
                        <div className="p-3 bg-white/20 rounded-2xl">
                            <Inbox className="w-8 h-8 text-white" />
                        </div>
                        <div>
                            <CardTitle className="text-2xl font-black tracking-tight">{t('receiveList')}</CardTitle>
                            <p className="text-purple-100/80 text-sm mt-1">{t('receiveListDesc')}</p>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center p-12">
                            <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                        </div>
                    ) : history.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-12 text-center text-gray-500">
                            <Inbox className="w-12 h-12 text-gray-300 mb-4" />
                            <p>受け取り履歴がありません。</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {history.map((item, idx) => (
                                <div key={`${item.uuid}-${idx}`} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 transition-colors">
                                    <div>
                                        <p className="font-mono text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded inline-block mb-2">
                                            UUID: {item.uuid}
                                        </p>
                                        <p className="text-sm font-medium text-gray-600">
                                            {new Date(item.timestamp).toLocaleString()}
                                        </p>
                                    </div>
                                    <Button 
                                        variant="outline" 
                                        className="gap-2 sm:ms-auto rounded-xl border-purple-200 text-purple-700 hover:bg-purple-50"
                                        onClick={() => window.open(`/receive/${item.uuid}`, '_blank')}
                                    >
                                        ギフト詳細 <ExternalLink className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
