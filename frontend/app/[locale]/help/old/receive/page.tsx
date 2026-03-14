import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'Metadata' });

    return {
        title: `商品の受け取りヘルプ | ${t('title')}`,
        description: t('description'),
    };
}

export default function ReceiveHelpPage() {
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
                        商品の受け取り方（受け取る方向け）
                    </h1>
                </div>

                <div className="space-y-12 rounded-xl bg-card p-6 shadow-sm border sm:p-10">

                    <section>
                        <h2 className="mb-6 border-b pb-2 text-2xl font-bold tracking-tight">商品の受け取り手順</h2>
                        <div className="space-y-8">

                            {/* Step 1: Enter */}
                            <div>
                                <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
                                    パスコードの入力
                                </h3>
                                <p className="mb-4 text-muted-foreground">
                                    QRコードを読み取ってアクセスした受取ページで、カードに書かれている8桁の数字(PINコード)を入力し、「ギフトを見る」ボタンを押してください。
                                    名刺代わりにではQRコードの不正利用防止のため、PINコードを設定しております。
                                </p>
                                {/* <div className="overflow-hidden rounded-lg border shadow-sm mb-10 mt-5">
                                    <p className="ml-2 text-primary text-sm mt-2">パスコード入力画面</p>
                                    <Image src="/images/manual/receive-enter.png" alt="パスコード入力画面" width={800} height={400} className="w-full object-cover" />
                                </div> */}
                                <div className="overflow-hidden rounded-lg border shadow-sm mb-10 mt-5">
                                    <p className="ml-2 text-primary text-sm mt-2">PINコード入力画面</p>
                                    <Image src="/images/manual/receive-verifi.png" alt="商品確認画面" width={800} height={400} className="w-full object-cover" />
                                </div>
                            </div>

                            {/* Step 2: Submit */}
                            <div>
                                <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
                                    配送先情報の入力
                                </h3>
                                <p className="mb-4 text-muted-foreground">
                                    氏名、住所、電話番号など、商品のお届けに必要な配送先情報を入力し、受け取り手続きを完了させます。
                                    この手続きによって、その商品を対応しているショップに配送に必要な住所情報などが通知されます。<br />
                                    場合によってはショップがメッセージを残している場合があります。
                                </p>
                                <p className="mb-4 text-muted-foreground">
                                    必ず有効期限内に処理を行ってください。有効期限が切れた場合はそのカードを使用することは一切できなくなります。有効期限はそのカードが店頭で購入・有効化されたタイミングで設定されます。有効期限の長さは商品によって異なります。
                                </p>
                                <p className="mb-4 text-muted-foreground">
                                    ※もし入力情報を間違えた場合は、「？お問い合わせ」ボタンから商品の詳細情報を確認し、手順④に進んでください。
                                </p>
                                <div className="overflow-hidden rounded-lg border shadow-sm mb-10 mt-5">
                                    <p className="ml-2 text-primary text-sm mt-2">配送先情報の入力画面</p>
                                    <Image src="/images/manual/receive-enter.png" alt="配送先情報の入力画面" width={800} height={400} className="w-full object-cover" />
                                </div>
                            </div>

                            {/* Step 3: Chat */}
                            <div>
                                <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
                                    配送待ち画面
                                </h3>
                                <p className="mb-4 text-muted-foreground">
                                    入力直後の画面です。ショップ担当者が配送処理を行っていない状態を表します。この画面が表示されている間は、まだ配送は完了していません。<br />
                                    もし発送処理を対応しているショップに対して、不明点等を問い合わせたい場合は、「？お問い合わせ」ボタンから商品の詳細情報を確認し、手順④に進んでください。
                                </p>
                                <div className="overflow-hidden rounded-lg border shadow-sm mb-10 mt-5">
                                    <p className="ml-2 text-primary text-sm mt-2">配送待ち画面</p>
                                    <Image src="/images/manual/receive-submit.png" alt="配送待ち画面" width={800} height={400} className="w-full object-cover" />
                                </div>
                            </div>

                            {/* Step 4: Shop Info */}
                            <div>
                                <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">4</span>
                                    ショップ情報の確認
                                </h3>
                                <p className="mb-4 text-muted-foreground">
                                    「？お問い合わせ」ボタンから提供元のショップの詳細情報（プロフィールやリンクなど）を確認することができます。配送に対するお問い合わせや、配送情報の修正などに対してはこれらの情報を利用し、直接ご連絡ください。
                                </p>
                                <p className="mb-4 text-muted-foreground">
                                    ※問い合わせを行う際には、必ず「注文ID」と「ショップ名」を伝えてください。また、PINコードは伝えないようご注意ください。
                                </p>
                                <div className="overflow-hidden rounded-lg border shadow-sm mb-10 mt-5">
                                    <p className="ml-2 text-primary text-sm mt-2">ショップ情報画面</p>
                                    <Image src="/images/manual/receive-shop.png" alt="ショップ情報画面" width={800} height={400} className="w-full object-cover" />
                                </div>
                            </div>

                            {/* Step 5: Chat */}
                            <div>
                                <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">5</span>
                                    チャット機能
                                </h3>
                                <p className="mb-4 text-muted-foreground">
                                    送り主(QRコードとPINコードを知っている人)がチャット欄にコメントを残している可能性があります。名前とメッセージを入力して送信することでコメントを残すことができます。
                                </p>
                                <div className="overflow-hidden rounded-lg border shadow-sm mb-10 mt-5">
                                    <p className="ml-2 text-primary text-sm mt-2">チャット機能画面</p>
                                    <Image src="/images/manual/receive-chat.png" alt="チャット機能画面" width={800} height={400} className="w-full object-cover" />
                                </div>
                            </div>

                            {/* Step 6: Shipped */}
                            <div>
                                <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">6</span>
                                    発送状況の確認
                                </h3>
                                <p className="mb-4 text-muted-foreground">
                                    ショップから商品が発送されると、画面上で「発送済み」等のステータスが更新されます。また、メールアドレスを登録している方には通知メールが届きます。
                                    商品の到着をお待ちください。
                                </p>
                                <p className="mb-4 text-muted-foreground">
                                    商品が到着した際には、「受け取り完了」ボタンの押下にご協力ください。商品の受け取りが正常に完了した通知がショップや、(通知設定を行っている場合には)送り主にも届きます。
                                </p>
                                <div className="overflow-hidden rounded-lg border shadow-sm mb-10 mt-5">
                                    <p className="ml-2 text-primary text-sm mt-2">発送状況確認画面</p>
                                    <Image src="/images/manual/receive-shipped.png" alt="発送状況確認画面" width={800} height={400} className="w-full object-cover" />
                                </div>
                            </div>

                            {/* Step 7: Invalid Card */}
                            <div>
                                <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">7</span>
                                    無効なカード
                                </h3>
                                <p className="mb-4 text-muted-foreground">
                                    以下の表示はショップによる有効化処理が行われていない、または不正利用などによって無効化されたカードを示しています。カードを渡してくれた人に確認をお願いします。また、カード購入者は購入した店舗に対する問い合わせを行ってください。
                                </p>
                                <div className="overflow-hidden rounded-lg border shadow-sm mb-10 mt-5">
                                    <p className="ml-2 text-primary text-sm mt-2">無効なカード画面</p>
                                    <Image src="/images/manual/receive-invalid.png" alt="無効なカード画面" width={800} height={400} className="w-full object-cover" />
                                </div>
                            </div>

                        </div>
                    </section>

                </div>
            </div >
        </div >
    );
}
