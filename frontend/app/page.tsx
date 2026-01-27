import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
      <main className="flex flex-col items-center gap-8 px-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          名刺代わりに、<br />
          <span className="text-primary">心を贈ろう。</span>
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          MeishiGawariniは、QRコードを使った新しいデジタルギフトサービスです。
          カードで手軽に想いを手渡し、重いギフトは相手の好きな住所に直接配送できます。
        </p>
        <div className="flex gap-4">
          <Link
            href="/shop"
            className="rounded-full bg-primary px-8 py-3 text-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            ショップ管理者画面
          </Link>
        </div>
      </main>
    </div>
  );
}
