import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft, BookOpen, Settings, ChevronRight, Store, Package, Bug, Waypoints, QrCode, Crown } from 'lucide-react';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'Metadata' });

    return {
        title: `管理者用ヘルプ | ${t('title')}`,
    };
}

export default function AdminHelpGatewayPage() {
    return (
        <div className="min-h-screen bg-mist-900 text-white pb-20 pt-10">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">

                <div className="mb-8 flex justify-between items-center">
                    <Link href="/admin" className="inline-flex items-center text-sm font-medium text-white/60 hover:text-white transition-colors">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        ダッシュボードに戻る
                    </Link>
                </div>

                {/* Header Section */}
                <div className="mb-10 text-center">
                    <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-white mb-4 shadow-sm">
                        <Crown className="h-8 w-8" />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        システム管理者マニュアル
                    </h1>
                    <p className="mt-4 text-lg text-white/60">
                        確認したい項目をお選びください。
                    </p>
                </div>

                <div className="grid gap-6 md:grid-cols-2">

                    {/* Operational Flow (Common) */}
                    <Link href="/admin/help/flow" className="group relative rounded-xl border border-white/10 bg-white/5 p-8 shadow-sm transition-all hover:bg-white/10 hover:border-white/20 block md:col-span-2">
                        <div className="flex items-center gap-6">
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-mist-900 shadow-lg">
                                <Waypoints className="h-8 w-8" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold tracking-tight text-white group-hover:text-white/80 transition-colors">
                                    ご利用の流れ（全体像）
                                </h2>
                                <p className="mt-2 text-white/60">
                                    ユーザーがカードを受け取ってからギフトを受け取るまでの全体像を解説します。
                                </p>
                            </div>
                        </div>
                        <div className="mt-6 flex items-center text-sm font-medium text-white/80">
                            全体の流れを見る
                            <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </div>
                    </Link>

                    {/* Admin Sections */}
                    <Link href="/admin/help/overview" className="group relative rounded-xl border border-white/10 bg-white/5 p-8 shadow-sm transition-all hover:bg-white/10 block">
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white">
                            <BookOpen className="h-6 w-6" />
                        </div>
                        <h2 className="text-xl font-bold text-white group-hover:text-white/80 transition-colors">
                            管理者ヘルプ概要
                        </h2>
                        <p className="mt-2 text-sm text-white/60">
                            管理者専用機能の全体的な使い方と権限について説明します。
                        </p>
                        <div className="mt-6 flex items-center text-sm font-medium text-white/80">
                            詳細を見る
                            <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </div>
                    </Link>

                    <Link href="/admin/help/qrcodes" className="group relative rounded-xl border border-white/10 bg-white/5 p-8 shadow-sm transition-all hover:bg-white/10 block">
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white">
                            <QrCode className="h-6 w-6" />
                        </div>
                        <h2 className="text-xl font-bold text-white group-hover:text-white/80 transition-colors">
                            カード一覧
                        </h2>
                        <p className="mt-2 text-sm text-white/60">
                            カードの状態確認、BAN処理、検索方法について説明します。
                        </p>
                        <div className="mt-6 flex items-center text-sm font-medium text-white/80">
                            詳細を見る
                            <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </div>
                    </Link>

                    <Link href="/admin/help/cardorders" className="group relative rounded-xl border border-white/10 bg-white/5 p-8 shadow-sm transition-all hover:bg-white/10 block">
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white">
                            <Package className="h-6 w-6" />
                        </div>
                        <h2 className="text-xl font-bold text-white group-hover:text-white/80 transition-colors">
                            カード印刷
                        </h2>
                        <p className="mt-2 text-sm text-white/60">
                            印刷用PDFのダウンロードや、バッチ管理について説明します。
                        </p>
                        <div className="mt-6 flex items-center text-sm font-medium text-white/80">
                            詳細を見る
                            <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </div>
                    </Link>

                    <Link href="/admin/help/designs" className="group relative rounded-xl border border-white/10 bg-white/5 p-8 shadow-sm transition-all hover:bg-white/10 block">
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white">
                            <Settings className="h-6 w-6" />
                        </div>
                        <h2 className="text-xl font-bold text-white group-hover:text-white/80 transition-colors">
                            デザイン設定
                        </h2>
                        <p className="mt-2 text-sm text-white/60">
                            カードデザインの登録、配置の微調整（エディタ）方法を説明します。
                        </p>
                        <div className="mt-6 flex items-center text-sm font-medium text-white/80">
                            詳細を見る
                            <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </div>
                    </Link>

                    <Link href="/admin/help/shops" className="group relative rounded-xl border border-white/10 bg-white/5 p-8 shadow-sm transition-all hover:bg-white/10 block">
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white">
                            <Store className="h-6 w-6" />
                        </div>
                        <h2 className="text-xl font-bold text-white group-hover:text-white/80 transition-colors">
                            ショップ管理
                        </h2>
                        <p className="mt-2 text-sm text-white/60">
                            ショップの新規開設、オーナーの紐付け設定を説明します。
                        </p>
                        <div className="mt-6 flex items-center text-sm font-medium text-white/80">
                            詳細を見る
                            <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </div>
                    </Link>

                    <Link href="/admin/help/tools" className="group relative rounded-xl border border-white/10 bg-white/5 p-8 shadow-sm transition-all hover:bg-white/10 block">
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white">
                            <Bug className="h-6 w-6" />
                        </div>
                        <h2 className="text-xl font-bold text-white group-hover:text-white/80 transition-colors">
                            ツール
                        </h2>
                        <p className="mt-2 text-sm text-white/60">
                            データのエクスポートやメンテナンス用の特殊操作を説明します。
                        </p>
                        <div className="mt-6 flex items-center text-sm font-medium text-white/80">
                            詳細を見る
                            <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </div>
                    </Link>

                </div>
            </div>
        </div>
    );
}
