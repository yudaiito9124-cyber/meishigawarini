import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="relative z-10 flex w-full justify-end p-6">
        <Link
          href="/shop"
          className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          ショップ管理者画面
        </Link>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 text-center -mt-20">
        <h1 className="text-4xl font-bold tracking-tight sm:text-7xl">
          名刺代わりに、<br />
          <span className="text-primary"> 心を贈ろう。</span>
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          ”名刺代わりに。” は出会いにちょっとした贈りものを添えるデジタルギフトサービス。
          ギフトの送り先はQRコードから指定できます。
        </p>
      </main>
    </div>
  );
}
