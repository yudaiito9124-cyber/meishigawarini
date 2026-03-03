import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft, BookOpen, Settings, ChevronRight } from 'lucide-react';

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
                            <BookOpen className="h-6 w-6" />
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                            まず初めに
                        </h2>
                        <p className="mt-2 text-muted-foreground">
                            アカウント登録、ログイン、ショップの作成など、システムを使い始めるための初期設定について説明します。
                        </p>
                        <div className="mt-6 flex items-center text-sm font-medium text-primary">
                            マニュアルを見る
                            <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </div>
                    </Link>

                    {/* Operation Card */}
                    <Link href="/help/shop/operation" className="group relative rounded-xl border bg-card p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-md block">
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Settings className="h-6 w-6" />
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                            操作の仕方
                        </h2>
                        <p className="mt-2 text-muted-foreground">
                            商品の登録、QRコードの紐付け、注文の確認など、日常的なショップの運用操作について説明します。
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
