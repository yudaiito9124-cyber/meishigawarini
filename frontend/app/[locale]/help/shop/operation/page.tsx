import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import Image from 'next/image';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'Metadata' });

    return {
        title: `ショップ運用のヘルプ - 操作の仕方 | ${t('title')}`,
        description: t('description'),
    };
}

export default function ShopOperationHelpPage() {
    return (
        <div className="min-h-screen bg-background pb-20 pt-10">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">

                {/* Header Section */}
                <div className="mb-8">
                    <Link href="/help/shop" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground mb-4 transition-colors">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        「まず初めに」へ戻る
                    </Link>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl text-center">
                        ショップ運用マニュアル（操作の仕方）
                    </h1>
                </div>

                <div className="space-y-12 rounded-xl bg-card p-6 shadow-sm border sm:p-10">
                    <section>
                        <h2 className="mb-6 border-b pb-2 text-2xl font-bold tracking-tight">ショップの操作一覧</h2>
                        <div className="space-y-8">

                            {/* Section 1: Shop List */}
                            <div>
                                <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
                                    各ショップの管理画面
                                </h3>
                                <p className="mb-4 text-muted-foreground">
                                    ログインし、ショップを選択すると、各ショップの管理画面に移動します。最初は商品がないため、手順②を行ってください。
                                </p>
                                <div className="overflow-hidden rounded-lg border shadow-sm mb-10 mt-5">
                                    <p className="ml-2 text-primary text-sm mt-2">ショップ管理画面</p>
                                    <Image src="/images/manual/shopadmincut.png" alt="ショップ管理画面" width={800} height={400} className="w-full object-cover bg-muted" />
                                </div>
                            </div>

                            {/* Section 2: Product Creation */}
                            <div>
                                <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
                                    商品の新規登録・管理
                                </h3>
                                <p className="mb-4 text-muted-foreground">
                                    画面を下に移動すると、商品一覧画面があります。ここから、商品の登録・停止・削除ができます。
                                </p>
                                <p className="mb-4 text-muted-foreground">
                                    商品を登録するには、商品名、説明テキスト、価格、有効期限(店頭で有効化してからそのカードが使えなくなるまでの日数)などの情報を入力します。商品画像を選択して保存すると、商品が一覧に追加されます。
                                </p>
                                <p className="mb-4 text-muted-foreground">
                                    ※商品は一度作成すると編集することはできません。これは既に印刷・有効化済みのカードに対して、交換される物品が一意に紐づいており、カードの有効化時から使用期限を迎えるまで、交換できる商品が変わらないことを保証するためになります。もし商品情報の編集を行いたい場合は、新しく同じ商品を追加し、古い商品に対する停止処理を行ってください。
                                </p>
                                <p className="mb-4 text-muted-foreground">
                                    「停止」ボタンを押して、「STOPPED」と表示されたカードは、新たにカードと紐づけることができなくなります。停止されたうえで、この商品の発送待ちの商品がなく、この商品と紐づけられた有効期限内のカードが存在しない場合は、この商品を削除することができます。これは、カードの有効期限内に登録されている商品が交換可能であることを保証するためになります。
                                </p>
                                <div className="overflow-hidden rounded-lg border shadow-sm mb-10 mt-5">
                                    <p className="ml-2 text-primary text-sm mt-2">商品管理画面</p>
                                    <Image src="/images/manual/shopadmin-addproduct.png" alt="商品管理画面" width={800} height={400} className="w-full object-cover bg-muted" />
                                </div>
                            </div>

                            {/* Section 3: QR Linking */}
                            <div>
                                <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
                                    QRコードの有効化
                                </h3>
                                <p className="mb-4 text-muted-foreground">
                                    この処理を行うことで、カードが有効化され、商品を交換できるようになります。
                                </p>

                                <h5>
                                    - カードに商品名が記載されているカードの場合（特定の商品にしか使用できない場合）
                                </h5>
                                <p className="mb-4 text-muted-foreground">
                                    1. 「QRコードをスキャン」から、カードのQRコードを読み取る<br />
                                    2. 「連携して有効化」ボタンを押す
                                </p>

                                <h5>
                                    - カードに商品名が記載されていないカードの場合（任意の商品に適用可能な場合）
                                </h5>
                                <p className="mb-4 text-muted-foreground">
                                    1. 「QRコードをスキャン」から、カードのQRコードを読み取る<br />
                                    2. 「商品を選択」から、そのカードに紐づける商品を選択する<br />
                                    3. 「連携して有効化」ボタンを押す
                                </p>

                                <p className="mb-4 text-muted-foreground">
                                    カードに対しては、必要に応じて、ショップからカードを受け取った人に対するメッセージや、ショップの担当者同士で共有するためのメモなどを残すことができます。
                                </p>

                                <div className="overflow-hidden rounded-lg border shadow-sm mb-10 mt-5">
                                    <p className="ml-2 text-primary text-sm mt-2">QR有効化画面</p>
                                    <Image src="/images/manual/shopadmin-activate.png" alt="QR有効化画面" width={800} height={400} className="w-full object-cover bg-muted" />
                                </div>
                            </div>

                            {/* Section 4: Order Management */}
                            <div>
                                <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">4</span>
                                    受注の管理と発送手続き
                                </h3>
                                <p className="mb-4 text-muted-foreground">
                                    商品の受け取り主が住所などを入力すると、「受診した注文」に「発送待ち」として表示されます。その注文を押すと住所や連絡先、配送希望日時等の詳細が確認可能です。
                                    商品を発送したら、詳細画面から配送業者と追跡番号を入力して「発送済みにする」を押してください。ステータスが「発送済み」となり、受け取り主からも配送状況が確認可能になります。
                                </p>
                                <p className="mb-4 text-muted-foreground">
                                    ※配送希望日時が -/- と表示されているものは、希望なしを表しています。また、受け取り主の入力状況に応じて一部の情報が欠損している場合もあります。
                                </p>
                                <div className="overflow-hidden rounded-lg border shadow-sm mb-10 mt-5">
                                    <p className="ml-2 text-primary text-sm mt-2">受注管理・発送画面</p>
                                    <Image src="/images/manual/shopadmin-list1.png" alt="受注管理・発送画面" width={800} height={400} className="w-full object-cover bg-muted" />
                                </div>

                                <div className="overflow-hidden rounded-lg border shadow-sm mb-10 mt-5">
                                    <p className="ml-2 text-primary text-sm mt-2">注文詳細画面</p>
                                    <Image src="/images/manual/shopadminqrdetailcut.png" alt="注文詳細画面" width={800} height={400} className="w-full object-cover bg-muted" />
                                </div>
                                <p className="mb-4 text-muted-foreground">
                                    発送済みの商品はページの下にある「過去の注文履歴」から確認可能です。
                                </p>
                                <div className="overflow-hidden rounded-lg border shadow-sm mb-10 mt-5">
                                    <p className="ml-2 text-primary text-sm mt-2">過去の注文履歴画面</p>
                                    <Image src="/images/manual/shopadmin-list2.png" alt="過去の注文履歴画面" width={800} height={400} className="w-full object-cover bg-muted" />
                                </div>
                            </div>

                            {/* Section 5: Order Management */}
                            <div>
                                <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">5</span>
                                    カード・注文の状態一覧
                                </h3>
                                <p className="mb-4 text-muted-foreground">
                                    カードの状態がどのような状況を表しているのか、またどの段階にあるのかはページの一番下にあるステータスガイドから確認できます。
                                </p>
                                <div className="overflow-hidden rounded-lg border shadow-sm mb-10 mt-5">
                                    <p className="ml-2 text-primary text-sm mt-2">ステータスガイド</p>
                                    <Image src="/images/manual/shopadmin-statusinfo.png" alt="ステータスガイド" width={800} height={400} className="w-full object-cover bg-muted" />
                                </div>
                            </div>

                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
