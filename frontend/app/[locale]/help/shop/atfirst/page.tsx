import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft, ArrowRight } from 'lucide-react';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'Metadata' });

    return {
        title: `ショップ運用のヘルプ | ${t('title')}`,
        description: t('description'),
    };
}

export default function ShopHelpPage() {
    return (
        <div className="min-h-screen bg-background pb-20 pt-10">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">

                {/* Header Section */}
                <div className="mb-8">
                    <Link href="/help" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground mb-4 transition-colors">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        ヘルプのトップに戻る
                    </Link>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl text-center">
                        ショップ運用マニュアル（まず初めに）
                    </h1>
                </div>


                <div className="space-y-30 rounded-xl bg-card p-6 shadow-sm border sm:p-10">

                    {/* URL Notice */}

                    <div>
                        <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
                            管理者画面への移動
                        </h3>
                        <p className="mb-4 text-muted-foreground">
                            管理画面には、トップページの右上にある「ショップ管理者画面」からアクセスできます。
                        </p>
                        <section className="rounded-lg bg-primary/5 p-6 border border-primary/20">
                            <div className="flex items-center justify-between rounded bg-background p-3 shadow-inner">
                                <Link href="https://meishigawarini.com/shop"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-medium text-primary hover:underline">https://meishigawarini.com/shop</Link>
                            </div>
                        </section>
                        <div className="overflow-hidden rounded-lg border shadow-sm mb-10 mt-5">
                            <Link href="/shop" className="ml-2 text-primary hover:underline text-sm">https://meishigawarini.com</Link>
                            <Image src="/images/manual/topcut.png" alt="トップ画面" width={800} height={400} className="w-full object-cover" />
                        </div>
                    </div>

                    {/* 1. Account & Login */}
                    <section>
                        <h2 className="mb-6 border-b pb-2 text-2xl font-bold tracking-tight">1. アカウント登録とログイン</h2>
                        <div className="space-y-8">
                            <div>
                                <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
                                    アカウント登録
                                </h3>
                                <p className="mb-4 text-muted-foreground">
                                    初めてご利用の方は、アカウントの登録が必要です。ログイン画面の下にある青文字の「登録する」を押して登録ページに移動してください。
                                </p>
                                <p className="mb-4 text-muted-foreground">
                                    登録ページでは任意のメールアドレス(ログイン、および顧客に対して問い合わせ窓口として表示されます)と、パスワードを入力してください。
                                    最後に登録ボタンを押下してください。
                                </p>
                                <div className="overflow-hidden rounded-lg border shadow-sm mb-10 mt-5">
                                    <Link href="/register" className="ml-2 text-primary hover:underline text-sm">https://meishigawarini.com/register</Link>
                                    <Image src="/images/manual/registercut.png" alt="登録画面" width={800} height={400} className="w-full object-cover" />
                                </div>
                            </div>

                            <div>
                                <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
                                    メール認証
                                </h3>
                                <p className="mb-4 text-muted-foreground">
                                    登録したメールアドレス宛に認証メールが届きます。認証メールの本文に記載された6桁の数字が認証コードになります。この認証コードをWebサイトの認証画面で入力し、
                                    確認ボタンを押下して認証を完了させてください。
                                </p>
                                <p className="mb-4 text-muted-foreground">
                                    送信元アドレス：no-reply@verificationemail.components<br />
                                    件名：【名刺がわりに】【名刺がわりに】認証コードのお知らせ (2FA Notification for Meishigawarini)
                                </p>
                                <p className="mb-4 text-muted-foreground">
                                    ※迷惑メール設定等を確認してください。場合によっては迷惑メールフォルダなどに移動されている可能性があります。
                                </p>
                                <div className="overflow-hidden rounded-lg border shadow-sm mb-10 mt-5">
                                    <p className="ml-2 text-primary text-sm">認証メールの例</p>
                                    <Image src="/images/manual/verifymail.png" alt="メール認証" width={400} height={300} className="w-full object-cover" />
                                </div>
                                <div className="overflow-hidden rounded-lg border shadow-sm mb-10 mt-5">
                                    <Link href="/verify" className="ml-2 text-primary hover:underline text-sm">https://meishigawarini.com/verify</Link>
                                    <Image src="/images/manual/verifycut.png" alt="認証完了" width={400} height={300} className="w-full object-cover" />
                                </div>
                                {/* </div> */}
                            </div>

                            <div>
                                <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
                                    ログイン
                                </h3>
                                <p className="mb-4 text-muted-foreground">
                                    登録したメールアドレスとパスワードでログインします。
                                </p>
                                <div className="overflow-hidden rounded-lg border shadow-sm mb-10 mt-5">
                                    <Link href="/login" className="ml-2 text-primary hover:underline text-sm">https://meishigawarini.com/login</Link>
                                    <Image src="/images/manual/logincut.png" alt="ログイン画面" width={800} height={400} className="w-full object-cover" />
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 2. Shop Management */}
                    <section>
                        <h2 className="mb-6 border-b pb-2 text-2xl font-bold tracking-tight">2. ショップ管理について</h2>
                        <div className="space-y-8">

                            <div>
                                <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
                                    ショップ一覧
                                </h3>
                                <p className="mb-4 text-muted-foreground">
                                    作成済みのショップ一覧を確認・各ショップへ移動できます。
                                    任意のショップを選択すると、③に示す各ショップの管理画面に移動できます。
                                </p>
                                <p className="mb-4 text-muted-foreground">
                                    初期状態ではショップが存在しないため、右上にあるの「ショップ新規作成」ボタンを押下して、以下の②に進んでください。
                                </p>
                                <div className="overflow-hidden rounded-lg border shadow-sm mb-10 mt-5">
                                    <Link href="/shop" className="ml-2 text-primary hover:underline text-sm">https://meishigawarini.com/shop</Link>
                                    <Image src="/images/manual/shopscut.png" alt="ショップ一覧" width={800} height={400} className="w-full object-cover" />
                                </div>
                            </div>

                            <div>
                                <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
                                    ショップの作成
                                </h3>
                                <p className="mb-4 text-muted-foreground">
                                    新しくショップを開設する場合は、ショップ作成画面からショップ名を入力して「作成」ボタンを押してください。
                                </p>
                                <div className="overflow-hidden rounded-lg border shadow-sm max-w-lg mx-auto mb-10 mt-10">
                                    <p className="ml-2 text-primary text-sm">URL: https://meishigawarini.com/shop ページ内ダイアログ</p>
                                    <Image src="/images/manual/shopcreatecut.png" alt="ショップ作成" width={500} height={400} className="w-full object-cover" />
                                </div>
                            </div>


                            <div>
                                <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
                                    各ショップの管理画面
                                </h3>
                                <p className="mb-4 text-muted-foreground">
                                    この画面で商品の登録や、QRコードの登録、注文の確認などを行います。
                                </p>
                                <div className="grid gap-6">
                                    <div className="overflow-hidden rounded-lg border shadow-sm mb-10 mt-5">
                                        <p className="ml-2 text-primary text-sm">URL: https://meishigawarini.com/shop/[ショップID]</p>
                                        <Image src="/images/manual/shopadmincut.png" alt="ショップ管理1" width={800} height={400} className="w-full object-cover" />
                                        <Image src="/images/manual/shopadmin2cut.png" alt="ショップ管理2" width={800} height={400} className="w-full object-cover" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Link to Operation Guide */}
                    <div className="mt-12 flex justify-center sm:justify-end">
                        <Link href="/help/shop/operation" className="group inline-flex items-center justify-center rounded-full bg-primary px-8 py-4 text-sm font-medium text-primary-foreground shadow transition-all hover:bg-primary/90 hover:shadow-md">
                            次のステップ：操作の仕方へ
                            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </Link>
                    </div>

                </div>
            </div>
        </div>
    );
}
