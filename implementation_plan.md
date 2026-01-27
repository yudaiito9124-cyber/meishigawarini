# Landing Page Redesign

Replace the default Next.js starter page with a custom landing page for "MeishiGawarini".

## Design Goals
- **Service Name**: MeishiGawarini (名刺代わりに)
- **Concept**: Digital Gifting / QR Code Service
- **Call to Action**: "ショップへ移動" (Go to Shop) -> Links to `/shop`
- **Aesthetics**: Clean, modern, using existing Tailwind coloring variables (`--background`, `--foreground`, etc.) from `globals.css`.

## Proposed Changes

### Frontend
#### [MODIFY] [page.tsx](file:///c:/git/meishigawarini/frontend/app/page.tsx)
- Remove default Next.js content.
- Add a hero section with title and description.
- Add a primary button linking to `/shop`.

```tsx
import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
      <main className="flex flex-col items-center gap-8 px-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          名刺代わりに、<br/>
          <span className="text-primary">心を贈ろう。</span>
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          MeishiGawariniは、QRコードを使った新しいデジタルギフトサービスです。
          手軽に、想いを形にして届けましょう。
        </p>
        <div className="flex gap-4">
          <Link
            href="/shop"
            className="rounded-full bg-primary px-8 py-3 text-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            ショップを見る
          </Link>
        </div>
      </main>
    </div>
  );
}
```

## Verification
1.  Apply changes.
2.  Push to GitHub.
3.  Wait for Amplify build.
4.  Verify the new landing page on the live URL.
