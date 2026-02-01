import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function Home() {
  const t = useTranslations('HomePage');

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="relative z-10 flex w-full justify-end p-6">
        <Link
          href="/shop"
          className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          {t('shopAdmin')}
        </Link>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 text-center -mt-20">
        <h1 className="text-4xl font-bold tracking-tight sm:text-7xl">
          {t('heroTitle')}<br />
          <span className="text-primary"> {t('heroSubtitle')}</span>
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          {t('description')}
        </p>
      </main>
    </div>
  );
}
