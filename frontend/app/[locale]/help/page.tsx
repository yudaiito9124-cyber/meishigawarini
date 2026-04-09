import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Store, Package, ChevronRight, Bug, PlaneTakeoff, Gift, QrCode, LayoutDashboard } from 'lucide-react';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'Metadata' });

    return {
        title: `ヘルプ | ${t('title')}`,
        description: t('description'),
    };
}

export default function HelpPage() {
    return (
        <div className="min-h-screen bg-background pt-10 flex flex-col">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl flex-grow">

                {/* Header Section */}
                <div className="mb-10 text-center">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                        ヘルプ・操作マニュアル
                    </h1>
                    <p className="mt-4 text-lg text-muted-foreground">
                        ご利用の目的に合わせて、該当するマニュアルをお選びください。
                    </p>
                </div>

                <div className="min-h-screen">
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                        {/* Universal Flow Card */}
                        <Link href="/help/overview"
                            className="group relative rounded-xl border border-primary/20 bg-primary/5 p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-md block md:col-span-2">
                            <div className="flex items-center gap-6">
                                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
                                    <LayoutDashboard className="h-8 w-8" />
                                </div>
                                <div className="flex-grow">
                                    <h2 className="text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                                        新しいギフト体験を贈る
                                    </h2>
                                    <p className="mt-2 text-muted-foreground">
                                        カードの受け取りからギフトの到着まで、ユーザーの体験をステップ形式で解説します。
                                    </p>
                                </div>
                                <div className="flex items-center text-sm font-medium text-primary whitespace-nowrap">
                                    全体の流れを見る
                                    <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                                </div>
                            </div>
                        </Link>

                        {/* Recipient Card */}
                        <Link href="/help/receive"
                            className="group relative rounded-xl border bg-card p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-md block ">
                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <Gift className="h-6 w-6" />
                            </div>
                            <h2 className="text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                                ギフトを受け取る方
                            </h2>
                            <p className="mt-2 text-muted-foreground">
                                QRコードを受け取った後の操作方法、商品の引き換え手順、配送先住所の入力などに関するマニュアルです。
                            </p>
                            <div className="mt-6 flex items-center text-sm font-medium text-primary">
                                マニュアルを見る
                                <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                            </div>
                        </Link>

                        {/* Recipient Card */}
                        <Link href="/help/send"
                            className="group relative rounded-xl border bg-card p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-md block">
                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <PlaneTakeoff className="h-6 w-6" />
                            </div>
                            <h2 className="text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                                ギフトを贈る方
                            </h2>
                            <p className="mt-2 text-muted-foreground">
                                QRコードを贈る方の操作方法、自分の連絡先を登録するためのマニュアルです。
                            </p>
                            <div className="mt-6 flex items-center text-sm font-medium text-primary">
                                マニュアルを見る
                                <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                            </div>
                        </Link>

                        {/* User Profile Card */}
                        <Link href="/help/user"
                            className="group relative rounded-xl border bg-card p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-md block">
                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <QrCode className="h-6 w-6" />
                            </div>
                            <h2 className="text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                                マイページの使い方
                            </h2>
                            <p className="mt-2 text-muted-foreground">
                                アカウントをお持ちの方（贈り主・受取人）向けの、プロフィール設定や履歴確認に関するマニュアルです。
                            </p>
                            <div className="mt-6 flex items-center text-sm font-medium text-primary">
                                マニュアルを見る
                                <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                            </div>
                        </Link>

                        {/* Shop Owner Card */}
                        <Link href="/help/shop"
                            className="group relative rounded-xl border bg-card p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-md block">
                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <Store className="h-6 w-6" />
                            </div>
                            <h2 className="text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                                ショップオーナーの方
                            </h2>
                            <p className="mt-2 text-muted-foreground">
                                ショップの作成や商品の管理、QRコードの有効化など、運用に関するマニュアルです。
                            </p>
                            <div className="mt-6 flex items-center text-sm font-medium text-primary">
                                マニュアルを見る
                                <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                            </div>
                        </Link>


                    </div>
                </div>

                <div className="grid gap-6 md:grid-cols-1 md:grid-cols-1 mb-20 mt-20">
                    <Link href="https://docs.google.com/forms/d/e/1FAIpQLSdsMe9rC_Ua6wyK0hPt6X9KT9ieu3l78u7U4uhpdUdDK023Wg/viewform?usp=publish-editor"
                        className="group relative rounded-xl border bg-card/90 backdrop-blur-md p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-md block w-full">
                        <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <Bug className="h-6 w-6" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                                    システム管理者に対するお問い合わせ
                                </h2>
                                <p className="mt-0 text-sm text-muted-foreground">
                                    非常に解消が困難な問題の解決のご依頼、またはサービス改善に関するご意見をお寄せください。
                                </p>
                            </div>
                        </div>
                    </Link>
                </div>

            </div>

        </div>
    );
}
