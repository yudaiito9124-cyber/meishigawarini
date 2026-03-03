'use client';

import { HelpCircle } from 'lucide-react';
import { useLocale } from 'next-intl';
import Link from 'next/link';

export function HelpButton() {
    const locale = useLocale();

    return (
        <Link
            href={`/${locale}/help`}
            className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-background border border-border text-foreground shadow-lg transition-all duration-300 hover:scale-110 hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-4 focus:ring-primary/30"
            aria-label="ヘルプページを開く"
        >
            <HelpCircle className="h-8 w-8" />
        </Link>
    );
}
