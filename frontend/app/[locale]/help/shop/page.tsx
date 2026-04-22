/**
 * ファイル概要: ショップ管理用ヘルプ インデックスページ
 * 
 * 役割:
 * ショップオーナーや運用担当者向けに、商品の登録から発送管理、
 * カード発注といった具体的な業務フロー別のマニュアルへの導線を提供します。
 * 
 * 特徴:
 * 1. 業務フロー図 (Flow) へのアクセスを最優先に配置。
 * 2. 各管理機能（商品、アクティベーション、発送、発注）に対応した詳細マニュアルへ誘導。
 */

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft, ChevronRight, Gift, QrCode, Truck, CreditCard, CircleUserRound, Filter, Waypoints, Store, Paintbrush } from 'lucide-react';

/**
 * SEO用メタデータの生成
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'Metadata' });

    return {
        title: `ショップ運用のヘルプ | ${t('title')}`,
        description: t('description'),
    };
}

/**
 * ショップヘルプゲートウェイページコンポーネント
 */
export default function ShopHelpGatewayPage() {
    return (
        <div className="min-h-screen bg-background pb-20 pt-10">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">

                <div className="mb-8 flex justify-between items-center">
                    <Link href="/help" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        ヘルプのトップに戻る
                    </Link>
                </div>

                {/* Header Section */}
                <div className="mb-10 text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary shadow-sm mx-auto">
                        <Store className="h-8 w-8" />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                        ショップ運用マニュアル
                    </h1>
                    <p className="mt-4 text-lg text-muted-foreground">
                        確認したい項目をお選びください。
                    </p>
                </div>

                <div className="grid gap-6 md:grid-cols-2">

                    {/* Operational Flow (Shop Admin Specific) */}
                    <Link href="/help/shop/flow" className="group relative rounded-xl border border-primary/20 bg-primary/5 p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-md block md:col-span-2">
                        <div className="flex items-center gap-6">
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
                                <Waypoints className="h-8 w-8" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                                    ショップ運用マニュアル（全体像）
                                </h2>
                                <p className="mt-2 text-muted-foreground">
                                    商品の準備からカードの発注、アクティベーション、発送までの業務フローを解説します。
                                </p>
                            </div>
                        </div>
                        <div className="mt-6 flex items-center text-sm font-medium text-primary">
                            運用フロー図を見る
                            <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </div>
                    </Link>

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
                            <Gift className="h-6 w-6" />
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                            商品登録・ショップ設定
                        </h2>
                        <p className="mt-2 text-muted-foreground">
                            ショップの基本設定や、商品の登録・管理操作について説明します。
                        </p>
                        <div className="mt-6 flex items-center text-sm font-medium text-primary">
                            マニュアルを見る
                            <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </div>
                    </Link>

                    <Link href="/help/shop/activate" className="group relative rounded-xl border bg-card p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-md block">
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <QrCode className="h-6 w-6" />
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                            アクティベーション
                        </h2>
                        <p className="mt-2 text-muted-foreground">
                            QRコードと商品を紐付けて、カードを使用可能な状態にする方法を説明します。
                        </p>
                        <div className="mt-6 flex items-center text-sm font-medium text-primary">
                            マニュアルを見る
                            <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </div>
                    </Link>

                    <Link href="/help/shop/shipping" className="group relative rounded-xl border bg-card p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-md block">
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Truck className="h-6 w-6" />
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                            カード・受注管理
                        </h2>
                        <p className="mt-2 text-muted-foreground">
                            ユーザーからの受注を確認し、商品の発送手続きを行う手順を説明します。
                        </p>
                        <div className="mt-6 flex items-center text-sm font-medium text-primary">
                            マニュアルを見る
                            <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </div>
                    </Link>

                    {/* New: Card Application */}
                    <Link href="/help/shop/card-order" className="group relative rounded-xl border bg-card p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-md block">
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <CreditCard className="h-6 w-6" />
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                            物理カード発注
                        </h2>
                        <p className="mt-2 text-muted-foreground">
                            新しい物理カードが必要になった際の、システム管理者への発注手順を説明します。
                        </p>
                        <div className="mt-6 flex items-center text-sm font-medium text-primary">
                            マニュアルを見る
                            <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </div>
                    </Link>

                    {/* New: Card Filtering */}
                    <Link href="/help/shop/filter" className="group relative rounded-xl border bg-card p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-md block">
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Filter className="h-6 w-6" />
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                            カードの絞り込み
                        </h2>
                        <p className="mt-2 text-muted-foreground">
                            大量の受注データから目的の情報を素早く探し出すための、検索・フィルター機能を説明します。
                        </p>
                        <div className="mt-6 flex items-center text-sm font-medium text-primary">
                            マニュアルを見る
                            <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </div>
                    </Link>

                    {/* New: Card Design */}
                    <Link href="/help/shop/card-design" className="group relative rounded-xl border bg-card p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-md block">
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Paintbrush className="h-6 w-6" />
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                            カードデザイン作成
                        </h2>
                        <p className="mt-2 text-muted-foreground">
                            ショップオリジナルのカードをデザインする際の、サイズや印字位置などの仕様を説明します。
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
