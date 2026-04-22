/**
 * ファイル概要: アプリケーションのトップページ
 * 目的: ユーザーに対するサービスの簡単な説明と、ショップ管理者向けページへの遷移リンクを提供します。
 */
'use client';

// import Link from 'next/link';
// import { useTranslations } from 'next-intl';

// export default function Home() {
//   const t = useTranslations('HomePage');

//   return (
//     <div className="flex min-h-screen flex-col bg-background text-foreground">
//       <header className="relative z-10 flex w-full justify-end p-6">
//         <Link
//           href="/shop"
//           className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
//         >
//           {t('shopAdmin')}
//         </Link>
//       </header>
//       <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 text-center -mt-20">
//         <h1 className="text-4xl font-bold tracking-tight sm:text-7xl">
//           {t('heroTitle')}<br />
//           <span className="text-primary"> {t('heroSubtitle')}</span>
//         </h1>
//         <p className="max-w-xl text-lg text-muted-foreground">
//           {t('description')}
//         </p>
//       </main>
//     </div>
//   );
// }




// app/page.tsx
// import Link from 'next/link'

// export default function HomePage() {
//   const steps = [
//     {
//       step: '01',
//       title: 'カードを選ぶ',
//       desc: '提携ショップでお好みのギフトカード（QRコード付き）を購入。お土産にも、ちょっとしたお礼にも。',
//     },
//     {
//       step: '02',
//       title: '渡す',
//       desc: '初対面の挨拶や会食の場で、名刺代わりにカードを手渡します。重い荷物は不要。カード一枚だけ。',
//     },
//     {
//       step: '03',
//       title: '届く',
//       desc: '受け取った方がQRを読み取り、住所を入力すると後日ギフトが自宅に届きます。',
//     },
//   ]

//   return (
//     <main className="bg-white text-black min-h-screen">

//       {/* ── Nav ── */}
//       <nav className="fixed top-0 w-full flex justify-between items-center px-8 py-5 z-50 bg-white/90 backdrop-blur-sm">
//         <span className="font-black text-lg">名刺代わりに。</span>
//         <Link
//           href="/login"
//           className="bg-black text-white px-5 py-2 rounded-full text-sm font-medium hover:bg-gray-800 transition"
//         >
//           Shop Admin
//         </Link>
//       </nav>

//       {/* ── Hero ── */}
//       <section className="flex flex-col items-center justify-center min-h-screen text-center px-6 pt-20">
//         <p className="text-xs text-gray-400 uppercase tracking-widest mb-6">
//           Digital Gift Service
//         </p>
//         <h1 className="text-6xl md:text-8xl font-black leading-tight mb-8">
//           名刺代わりに、<br />心を贈る。
//         </h1>
//         <p className="text-gray-500 text-lg max-w-lg mb-12 leading-relaxed">
//           QRコード付きのカードを手渡すだけ。<br />
//           受け取った方の自宅へ、あなたの気持ちが届きます。
//         </p>
//         <div className="flex flex-col sm:flex-row gap-4">
//           <a
//             href="#shops"
//             className="bg-black text-white px-8 py-4 rounded-full text-base font-medium hover:bg-gray-800 transition"
//           >
//             対応ショップを見る
//           </a>
//           <a
//             href="#for-shops"
//             className="border border-gray-300 px-8 py-4 rounded-full text-base font-medium hover:border-black transition"
//           >
//             ショップ開設はこちら
//           </a>
//         </div>
//       </section>

//       {/* ── How it works ── */}
//       <section className="py-32 px-6">
//         <div className="max-w-2xl mx-auto">
//           <p className="text-xs text-gray-400 uppercase tracking-widest text-center mb-4">
//             How it works
//           </p>
//           <h2 className="text-3xl font-bold text-center mb-20">たった3ステップ</h2>
//           <div className="space-y-16">
//             {steps.map(({ step, title, desc }) => (
//               <div key={step} className="flex gap-6 items-start">
//                 <span className="text-8xl font-black text-gray-100 leading-none min-w-[80px]">
//                   {step}
//                 </span>
//                 <div className="pt-2">
//                   <h3 className="text-xl font-bold mb-2">{title}</h3>
//                   <p className="text-gray-500 leading-relaxed">{desc}</p>
//                 </div>
//               </div>
//             ))}
//           </div>
//         </div>
//       </section>

//       {/* ── Shops ── */}
//       <section id="shops" className="py-32 bg-gray-50 px-6">
//         <div className="max-w-4xl mx-auto">
//           <p className="text-xs text-gray-400 uppercase tracking-widest text-center mb-4">Shops</p>
//           <h2 className="text-3xl font-bold text-center mb-4">対応ショップ</h2>
//           <p className="text-center text-gray-400 text-sm mb-16">
//             現在ショップを募集中です。もうすぐ素敵なギフトが並びます。
//           </p>
//           <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
//             {[...Array(6)].map((_, i) => (
//               <div
//                 key={i}
//                 className="aspect-square bg-white rounded-2xl border border-gray-100 flex items-center justify-center"
//               >
//                 <span className="text-xs text-gray-300">coming soon</span>
//               </div>
//             ))}
//           </div>
//         </div>
//       </section>

//       {/* ── For Shop Owners ── */}
//       <section id="for-shops" className="py-32 px-6 text-center">
//         <div className="max-w-lg mx-auto">
//           <p className="text-xs text-gray-400 uppercase tracking-widest mb-4">For Shop Owners</p>
//           <h2 className="text-3xl font-bold mb-6">
//             あなたのお店も<br />参加しませんか
//           </h2>
//           <p className="text-gray-500 mb-10 leading-relaxed">
//             商品を「誰かへの贈り物」として届ける、新しい販売チャネル。<br />
//             ショップ登録・QRコード発行まで、すべて無料で始められます。
//           </p>
//           <Link
//             href="/register"
//             className="border border-black px-8 py-4 rounded-full text-base font-medium hover:bg-black hover:text-white transition inline-block"
//           >
//             ショップを開設する（無料）
//           </Link>
//         </div>
//       </section>

//       {/* ── Footer ── */}
//       <footer className="py-10 border-t border-gray-100 flex flex-col md:flex-row items-center justify-between px-8 text-sm text-gray-400">
//         <span className="font-black text-black text-base mb-2 md:mb-0">名刺代わりに。</span>
//         <span>© 2025 MeishiGawarini</span>
//       </footer>

//     </main>
//   )
// }


/**
 * ファイル概要: サービスランディングページ (LP)
 * 
 * 役割:
 * 「名刺代わりに。」のコンセプト、使い方、ユースケースを一般ユーザーおよび
 * 潜在的なショップオーナーに対して魅力的かつ簡潔に伝えます。
 * 
 * 主要セクション:
 * 1. Hero: キャッチコピーとアクションボタン。
 * 2. How it works: ギフトが届くまでの3ステップ。
 * 3. ポイント: サービスのメリット（荷物ゼロ、サプライズ等）。
 * 4. ユースケース: ビジネス、旅行、プレゼント等の具体的な活用シーン。
 * 5. 対応ショップ: パートナー企業の紹介（現状は準備中表示）。
 * 6. FAQ: 住所の取り扱いや送料に関するよくある質問。
 * 7. Shop Owners: ショップ開設のメリット。
 */

import { signInWithRedirect } from 'aws-amplify/auth';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link'
import {
  Store,
  HandshakeIcon,
  ScanQrCode,
  Package,
  Backpack,
  Lock,
  Sparkles,
  Briefcase,
  Plane,
  Cake,
  Heart,
  Building2,
  Wine,
  TrendingUp,
  ClipboardList,
  Tablet,
  BadgeCheck,
  ChevronDown,
  Plus,
  Gift,
  Ship,
  Coins,
  Brush,
} from 'lucide-react'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── データ定義 (コンテンツ内容) ────────────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ステップ解説データ */
const steps = [
  {
    icon: Store,
    step: 'STEP 01',
    title: 'ショップでカードを買う',
    dark: false,
  },
  {
    icon: HandshakeIcon,
    step: 'STEP 02',
    title: '名刺代わりに手渡す',
    dark: false,
  },
  {
    icon: ScanQrCode,
    step: 'STEP 03',
    title: '相手がQRをスキャン＆住所入力',
    dark: false,
  },
  {
    icon: Package,
    step: 'COMPLETE',
    title: '後日ギフトが自宅に届く',
    dark: true,
  },
]

/** サービスの特徴・メリット */
const points = [
  {
    icon: Backpack,
    title: '荷物ゼロ',
    desc: '重いお土産を持ち歩く必要なし。薄いカード一枚だけ。受け取った側も気楽です。',
  },
  {
    icon: Heart,
    title: '気持ち',
    desc: 'デジタルギフトって手軽だけど味気なくて残念...そんな時は任せてください。手渡しだから気持ちも伝わりますし、話のタネになります。',
  },
  {
    icon: Lock,
    title: '住所を聞かずに送れる',
    desc: '相手が自分のタイミングで入力するので、住所のやり取りは必要ありません。',
  },
  {
    icon: Sparkles,
    title: 'サプライズ感',
    desc: '後日届くギフトは、忘れた頃のサプライズ。記憶に残る体験になります。',
  },
  {
    icon: Ship,
    title: '送料は定額先払い',
    desc: '住所を書いて、元払いをして、宅配便業者にお願いして...そんな面倒はもう必要ありません。',
  },
  {
    icon: Gift,
    title: '賞味期限とおさらば',
    desc: 'あ！賞味期限切れてるじゃん！明日の出張の手土産買わなきゃ...なんてこと、カードなら賞味期限もないのであらかじめたくさんストックしておけます。',
  },
]

/** ユースケース */
const useCases = [
  {
    icon: Briefcase,
    label: 'Business',
    title: '初対面のビジネスシーンで',
    desc: '商談・交流会・展示会。名刺と一緒に渡せば「あの人、印象的だったな」と記憶に残ります。',
  },
  {
    icon: Plane,
    label: 'Travel',
    title: '旅行のお土産に',
    desc: '現地のおいしいものをそのまま贈れる。旅行中に荷物を増やさなくて済みます。',
  },
  {
    icon: Cake,
    label: 'Birthday',
    title: '誕生日プレゼントに',
    desc: '当日手ぶらでもOK。後日届くプレゼントは、サプライズ感が倍増します。',
  },
  {
    icon: Heart,
    label: 'Wedding',
    title: '結婚式・二次会のプチギフトに',
    desc: '住所を事前に収集する手間なし。受け取った方それぞれが自分で入力するだけ。',
  },
  {
    icon: Building2,
    label: 'Transfer',
    title: '転勤・引越しの挨拶に',
    desc: 'お世話になった方に配りやすい。住所を知らない、引っ越し先が決まっていない相手にも贈れます。',
  },
  {
    icon: Wine,
    label: 'Party',
    title: '飲み会・交流パーティーで',
    desc: '「また会いたい」という気持ちをカードに込めて。次の再会のきっかけになります。',
  },
]

/** ショップ導入のメリット */
const shopBenefits = [
  {
    icon: TrendingUp,
    title: '新しい販路',
    desc: 'お土産・ギフト需要をQRカードで獲得。新規顧客へリーチできます。お客さんの移動手段に左右されず、どんな時でも気軽に買っていただけます。',
  },
  {
    icon: BadgeCheck,
    title: '新しい価値',
    desc: 'かさばるから、重いから、鮮度が...。そんな商品こそ名刺代わりにぴったりです。鮮度の良いもの、作り立ての商品、自慢の逸品をお客様に届けることができます。',
  },
  {
    icon: Tablet,
    title: '導入も簡単',
    desc: 'カードの置き場所とネットにつながるタブレット・スマートフォンがあればすぐに導入できます。',
  },
  {
    icon: ClipboardList,
    title: '在庫処分におさらば',
    desc: '余剰在庫を処分する「もったいない」とおさらば。オーダーが入ってから商品の準備をすればOKだから、在庫の抱えすぎを改善できます。',
  },
  {
    icon: Gift,
    title: '大量に納品しやすい',
    desc: 'カードにあるのはデジタルな有効期限だけ。例えば足の速い商品でも、カードなら長い先を見据えて納品できます。',
  },
  {
    icon: Brush,
    title: 'オリジナルデザイン',
    desc: 'お店ごとのデザインで個性を出せます。ショップカードや商品の宣伝にも。',
  },
]

/** FAQ 内容 */
const faqs = [
  {
    q: '住所情報は誰に提供されますか？',
    a: '入力された住所は、その商品を扱うショップのみに提供されます。これは、配送処理を各ショップが対応しているためです。本来の目的以外への利用は行いません。',
  },
  {
    q: '受け取り側はアプリのインストールが必要ですか？',
    a: '不要です。スマートフォンでQRコードを読み取り、表示されるウェブページに住所を入力するだけです。',
  },
  {
    q: 'カードに有効期限はありますか？',
    a: '各商品の設定によって異なります。購入時にショップにご確認ください。購入したカードの場合は、QRコードを読み取り、PINコードを入力することで、残り日数を確認することができます',
  },
  {
    q: 'カードはどうやって手に入れますか？',
    a: '対応しているショップの店頭でお買い求めください。',
  },
  {
    q: '送料は受け取る人が支払うの？',
    a: '着払いではありません。店頭でカードを購入する際に、送料を含めた商品代金をカード代金としてお支払いいただきます。',
  },
]

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── 内部コンポーネント ──────────────────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** セクション上部の小さいラベル */
function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-xs text-gray-400 uppercase tracking-[0.2em] text-center mb-4 font-medium">
      {children}
    </p>
  )
}

/** セクション見出し (H2) */
function SectionHeading({ children }: { children: string }) {
  return (
    <h2 className="text-3xl font-bold text-center mb-4">{children}</h2>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── ページ本体 (HomePage) ────────────────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function HomePage() {
  /** ページ固有の翻訳リソース */
  const t = useTranslations('HomePage');
  /** サイト全体（サイト名等）の翻訳リソース */
  const ts = useTranslations('Site');

  const { locale } = useParams();

  /**
   * Managed Login (Hosted UI) を呼び出す共通ハンドラー
   * @param screenHint 'signup' を指定するとサインアップ画面を表示
   */
  const handleAuthRedirect = async () => {
    try {
      // aws-amplify の signInWithRedirect は options.lang を直接サポートしている。
      // queryParams は型定義に存在しないため使用不可。lang プロパティを直接渡す。
      await signInWithRedirect({
        options: {
          lang: locale as string,
        }
      });
    } catch (err) {
      console.error('Auth redirect error:', err);
    }
  };


  return (
    <main className="bg-white text-black">

      {/* ━━━ Nav ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <nav className="fixed top-0 w-full flex justify-between items-center px-8 py-5 z-50 bg-white/80 backdrop-blur-sm border-b border-gray-50">
        <a href="#" className="font-black text-lg tracking-tight hover:opacity-80 transition-opacity">{ts("name")}</a>
        <div className="flex items-center gap-4">
          <a href="#howto" className="hidden lg:block text-sm text-gray-500 hover:text-black transition-colors">使い方</a>
          <a href="#shops" className="hidden lg:block text-sm text-gray-500 hover:text-black transition-colors">ショップ一覧</a>
          <a href="#for-shops" className="hidden lg:block text-sm text-gray-500 hover:text-black transition-colors">ショップ開設</a>
          
          <button
            onClick={() => handleAuthRedirect()}
            className="ml-2 bg-black text-white px-5 py-2 rounded-full text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            {t('shopAdmin')}
          </button>
        </div >
      </nav >

      {/* ━━━ Hero ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="flex flex-col items-center justify-center h-screen max-h-[1000px] text-center px-6 pt-20">
        <p className="text-xs text-gray-400 uppercase tracking-[0.2em] mb-7 font-medium">
          Asset Transfer Token Card
        </p>

        {/*  
          日本語の句読点は視覚重心を左にズラすため、
          末尾の「。」にネガティブマージンを適用してセンターバランスを調整。
        */}
        <h1 className="text-6xl md:text-8xl font-black leading-tight mb-8">
          名刺代わりに<span className=""></span><br />
          心を贈る<span className="-mr-[0.45em]">。</span>
        </h1>

        <p className="text-gray-500 text-lg max-w-lg mb-12 leading-relaxed">
          QRコード付きのカードを一言添えて手渡せば、
          相手の自宅へ、プレゼントが届きます。
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={() => handleAuthRedirect()}
            className="bg-black text-white px-8 py-4 rounded-full text-base font-medium hover:bg-gray-800 transition-colors"
          >
            {t('shopAdmin')}
          </button>
          <a
            href="#howto"
            className="border border-gray-300 px-8 py-4 rounded-full text-base font-medium hover:border-black transition-colors"
          >
            使い方を見る
          </a>
        </div>

        {/* scroll hint */}
        {/* <div className="absolute bottom-10 flex flex-col items-center gap-1 text-gray-300">
          <span className="text-[10px] tracking-widest">SCROLL</span>
          <ChevronDown className="w-4 h-4" />
        </div> */}
      </section >

      {/* ━━━ How it works ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section id="howto" className="py-28 px-6 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <SectionLabel>How it works</SectionLabel>
          <SectionHeading>たった3ステップ</SectionHeading>

          {/* ステップフロー */}
          <div className="mt-16 mb-20 flex items-start justify-center gap-2 md:gap-4 flex-wrap">
            {steps.map(({ icon: Icon, step, title, dark }, i) => (
              <div key={step} className="flex items-start gap-2 md:gap-4">
                <div className="flex flex-col items-center text-center w-36">
                  <div
                    className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${dark
                      ? 'bg-black'
                      : 'bg-white border border-gray-100 shadow-sm'
                      }`}
                  >
                    <Icon className={`w-7 h-7 ${dark ? 'text-white' : 'text-black'}`} />
                  </div>
                  <span className="text-[10px] text-gray-400 mb-1 tracking-widest font-medium">
                    {step}
                  </span>
                  <p className="font-bold text-sm leading-snug">{title}</p>
                </div>
                {i < steps.length - 1 && (
                  <span className="pt-6 text-gray-300 text-xl select-none">→</span>
                )}
              </div>
            ))}
          </div>

          {/* 特徴ポイントグリッド */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {points.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white rounded-2xl p-6 border border-gray-100">
                <Icon className="w-6 h-6 mb-4 text-black" />
                <h3 className="font-bold mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link
              href="/help"
              className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-black transition-colors"
            >
              ヘルプセンターでさらに詳しくみる
              <span className="ml-1">→</span>
            </Link>
          </div>
        </div>
      </section >

      {/* ━━━ Use Cases ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section id="usecases" className="py-28 px-6">
        <div className="max-w-4xl mx-auto">
          <SectionLabel>Use Cases</SectionLabel>
          <SectionHeading>こんな場面で使えます</SectionHeading>
          <p className="text-center text-gray-400 text-sm mb-16">
            手ぶらでも、気の利いた一言を残せる
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {useCases.map(({ icon: Icon, label, title, desc }) => (
              <div
                key={label}
                className="border border-gray-100 rounded-2xl p-6 flex gap-5 hover:-translate-y-0.5 hover:shadow-md transition-all duration-150"
              >
                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon className="w-5 h-5 text-black" />
                </div>
                <div>
                  <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                    {label}
                  </span>
                  <h3 className="font-bold text-base mt-1 mb-2">{title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section >

      {/* ━━━ Shops ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section id="shops" className="py-28 bg-gray-50 px-6">
        <div className="max-w-4xl mx-auto">
          <SectionLabel>Shops</SectionLabel>
          <SectionHeading>対応ショップ</SectionHeading>
          <p className="text-center text-gray-400 text-sm mb-16">
            現在ショップを募集中です。もうすぐ素敵なギフトが並びます。
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="aspect-square bg-white rounded-2xl border border-gray-100 flex flex-col items-center justify-center gap-2"
              >
                <Store className="w-8 h-8 text-gray-200" />
                <span className="text-xs text-gray-300">coming soon</span>
              </div>
            ))}
          </div>
        </div>
      </section >

      {/* ━━━ FAQ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="py-28 px-6">
        <div className="max-w-2xl mx-auto">
          <SectionLabel>FAQ</SectionLabel>
          <SectionHeading>よくある質問</SectionHeading>
          <div className="mt-12 divide-y divide-gray-100">
            {faqs.map(({ q, a }) => (
              <details key={q} className="group py-5">
                <summary className="flex justify-between items-center cursor-pointer font-medium list-none">
                  {q}
                  <Plus className="w-5 h-5 text-gray-400 flex-shrink-0 ml-4 group-open:rotate-45 transition-transform duration-200" />
                </summary>
                <p className="text-gray-500 text-sm leading-relaxed mt-3 pr-8">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section >

      {/* ━━━ For Shop Owners ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section id="for-shops" className="py-28 px-6 bg-black text-white">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs text-gray-500 uppercase tracking-[0.2em] mb-4 font-medium">
            For Shop Owners
          </p>
          <h2 className="text-4xl font-black mb-6 leading-tight">
            あなたのお店も<br />参加しませんか
          </h2>
          <p className="text-gray-400 mb-12 leading-relaxed max-w-lg mx-auto">
            商品を「誰かへの贈り物」として届ける、新しい販売チャネル。
          </p>

          {/* ショップ導入メリットグリッド */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12 text-left">
            {shopBenefits.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="border border-gray-800 rounded-2xl p-5">
                <Icon className="w-6 h-6 mb-4 text-white" />
                <h3 className="font-bold mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
          <button
            onClick={() => handleAuthRedirect()}
            className="inline-block bg-white text-black px-8 py-4 rounded-full text-base font-medium hover:bg-gray-100 transition-colors"
          >
            {t('shopAdmin')}
          </button>
        </div>
      </section >

      {/* ━━━ Footer ━━━   ここはlayout.tsxに実装 */}
      {/* < footer className="py-10 border-t border-gray-100 flex flex-col md:flex-row items-center justify-between px-8 text-sm text-gray-400" >
        <span className="font-black text-black text-base mb-4 md:mb-0">名刺代わりに。</span>
        <div className="flex gap-6">
          <a href="#howto" className="hover:text-black transition-colors">使い方</a>
          <a href="#shops" className="hover:text-black transition-colors">ショップ一覧</a>
          <a href="#for-shops" className="hover:text-black transition-colors">ショップ開設</a>
        </div>
        <span className="mt-4 md:mt-0">© 2025 MeishiGawarini</span>
      </footer > */}

    </main >
  )
}

