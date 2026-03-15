import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft, BookOpen, Settings, ChevronRight, PlaneTakeoff, CircleUserRound, CreditCard, Zap } from 'lucide-react';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'Metadata' });

    return {
        title: `ショップ運用のヘルプ | ${t('title')}`,
        description: t('description'),
    };
}

export default function ShopHelpGatewayPage() {
    return (
        <div className="min-h-screen bg-background pb-20 pt-10">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">

                <div className="mb-8">
                    <Link href="/help" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground mb-4 transition-colors">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        ヘルプのトップに戻る
                    </Link>
                </div>

                {/* Header Section */}
                <div className="mb-10 text-center">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                        ショップ運用マニュアル
                    </h1>
                    <p className="mt-4 text-lg text-muted-foreground">
                        確認したい項目をお選びください。
                    </p>
                </div>

                <div className="grid gap-6 md:grid-cols-2">

                    {/* At First Card */}
                    <Link href="/help/shop/atfirst" className="group relative rounded-xl border bg-card p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-md block">
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <CircleUserRound className="h-6 w-6" />
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                            まず初めに
                        </h2>
                        <p className="mt-2 text-muted-foreground">
                            アカウント登録、ログインなど、システムを使い始めるための初期設定について説明します。
                        </p>
                        <div className="mt-6 flex items-center text-sm font-medium text-primary">
                            マニュアルを見る
                            <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </div>
                    </Link>

                    <Link href="/help/shop/manage" className="group relative rounded-xl border bg-card p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-md block">
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Settings className="h-6 w-6" />
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                            管理の仕方
                        </h2>
                        <p className="mt-2 text-muted-foreground">
                            ショップの初期設定、商品の登録等、ショップの管理操作について説明します。
                        </p>
                        <div className="mt-6 flex items-center text-sm font-medium text-primary">
                            マニュアルを見る
                            <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </div>
                    </Link>

                    <Link href="/help/shop/activate" className="group relative rounded-xl border bg-card p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-md block">
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <div className="relative flex items-center justify-center">
                                <CreditCard className="h-7 w-7" />
                                <div className="absolute -top-1 -right-1 rounded-full bg-background p-0.5">
                                    <Zap className="h-3.5 w-3.5 fill-primary text-primary" />
                                </div>

                            </div>
                        </div>
                        {/* <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Zap className="h-6 w-6" />
                        </div> */}
                        <h2 className="text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                            カードの有効化
                        </h2>
                        <p className="mt-2 text-muted-foreground">
                            カードの有効化について説明します。
                        </p>
                        <div className="mt-6 flex items-center text-sm font-medium text-primary">
                            マニュアルを見る
                            <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </div>
                    </Link>

                    <Link href="/help/shop/shipping" className="group relative rounded-xl border bg-card p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-md block">
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <PlaneTakeoff className="h-6 w-6" />
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                            発送処理
                        </h2>
                        <p className="mt-2 text-muted-foreground">
                            商品の発送処理について説明します。
                        </p>
                        <div className="mt-6 flex items-center text-sm font-medium text-primary">
                            マニュアルを見る
                            <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </div>
                    </Link>

                </div>
            </div>
        </div>
    );
}
