/**
 * ファイル概要: 全画面共通ヘルプフローティングボタン (Floating Help Button)
 * 
 * 役割:
 * 画面の右下に常駐するボタンを提供し、ユーザーがいつでもマニュアルやヘルプページに
 * アクセスできるようにします。
 * 
 * 主要機能:
 * 1. 固定配置（Fixed Position）による常時アクセス。
 * 2. `next-intl` による多言語化されたツールチップ/ARIA ラベルへの対応。
 * 3. 別タブでのヘルプページ表示。
 */

'use client';

import { HelpCircle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';

/**
 * 画面右下に固定表示されるヘルプボタンコンポーネント
 */
export function HelpButton() {
    /** 現在のユーザーロケール (ja/en等) */
    const locale = useLocale();
    /** 翻訳リソース ('HelpButton' セクション) */
    const t = useTranslations('HelpButton');

    return (
        <Link
            href={`/${locale}/help`}
            target="_blank"
            rel="noopener noreferrer"
            className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-background border border-border text-foreground shadow-lg transition-all duration-300 hover:scale-110 hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-4 focus:ring-primary/30 print:hidden"
            aria-label={t('ariaLabel')}
        >
            {/* Lucide-react のヘルプアイコン */}
            <HelpCircle className="h-8 w-8" />
        </Link>
    );
}

