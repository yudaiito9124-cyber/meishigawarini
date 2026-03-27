'use client';

import { useTranslations } from 'next-intl';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserPen, Send, Inbox, QrCode, LogOut, ChevronDown } from 'lucide-react';
import { SiteFooter } from '@/components/SiteFooter';
import { signOut } from 'aws-amplify/auth';

export default function UserDashboardPage() {
    const t = useTranslations('UserProfilePage');
    const router = useRouter();
    const params = useParams();
    const userId = params?.userid as string;

    const navItems = [
        {
            title: t('editProfile'),
            desc: t('editProfileDesc'),
            icon: UserPen,
            href: `/user/${userId}/editprofile`,
            color: "text-blue-600",
            bg: "bg-blue-50",
            border: "border-blue-100 hover:border-blue-300 hover:bg-blue-50/50"
        },
        {
            title: t('sendList'),
            desc: t('sendListDesc'),
            icon: Send,
            href: `/user/${userId}/send`,
            color: "text-green-600",
            bg: "bg-green-50",
            border: "border-green-100 hover:border-green-300 hover:bg-green-50/50"
        },
        {
            title: t('receiveList'),
            desc: t('receiveListDesc'),
            icon: Inbox,
            href: `/user/${userId}/receivedgift`,
            color: "text-purple-600",
            bg: "bg-purple-50",
            border: "border-purple-100 hover:border-purple-300 hover:bg-purple-50/50"
        },
        {
            title: t('sendGift'),
            desc: t('sendGiftDesc'),
            icon: QrCode,
            href: `/user/${userId}/sendgift`,
            color: "text-orange-600",
            bg: "bg-orange-50",
            border: "border-orange-100 hover:border-orange-300 hover:bg-orange-50/50"
        }
    ];

    const handleLogout = async () => {
        try {
            await signOut();
            router.push('/login');
        } catch (error) {
            console.error('Error signing out: ', error);
        }
    };

    return (
        <div className="flex flex-col min-h-screen bg-mist-50 font-sans">
            <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8 pb-12 pt-12">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-black text-gray-800 tracking-tight">{t('title')}</h1>
                    <div>
                        <Button variant="ghost" className="text-mist-500 hover:text-mist-800" onClick={handleLogout}>
                            <ChevronDown className="h-4 w-4 mr-1 rotate-90" /> {t('back')}
                        </Button>
                        <Button variant="ghost" className="text-mist-500 hover:text-mist-800" onClick={handleLogout}>
                            <LogOut className="w-5 h-5 mr-2" />
                            {t('logout')}
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {navItems.map((item, idx) => (
                        <Card
                            key={idx}
                            onClick={() => router.push(item.href)}
                            className={`cursor-pointer transition-all hover:scale-105 active:scale-95 shadow-md border-2 ${item.border} rounded-3xl overflow-hidden`}
                        >
                            <CardContent className="p-6 flex flex-col items-center justify-center text-center gap-4 h-full">
                                <div className={`p-4 rounded-2xl ${item.bg}`}>
                                    <item.icon className={`w-10 h-10 ${item.color}`} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-800 mb-2">{item.title}</h3>
                                    <p className="text-sm text-gray-500 font-medium">{item.desc}</p>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </main>
            <div className="flex justify-center p-4">
                <Button className="w-full p-4 h-10 hover:bg-mist-500 hover:text-mist-50" variant="ghost" onClick={() => router.push('/shop')}>ショップを開設する</Button>
            </div>
        </div>
    );
}
