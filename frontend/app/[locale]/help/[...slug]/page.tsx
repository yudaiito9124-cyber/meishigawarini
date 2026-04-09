import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { ArrowLeft, Waypoints, Gift, SendHorizontal, CircleUserRound, Store, Crown } from 'lucide-react';
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { MarkdownRenderer } from '@/components/help/MarkdownRenderer';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';

interface Props {
  params: Promise<{
    locale: string;
    slug: string[];
  }>;
}

const CategoryIconMap: Record<string, React.ElementType> = {
  overview: Waypoints,
  receive: Gift,
  send: SendHorizontal,
  user: CircleUserRound,
  shop: Store,
  admin: Crown,
};

const CategoryTitleMap: Record<string, string> = {
  overview: 'ご利用ガイド',
  receive: '受取人マニュアル',
  send: '贈り主マニュアル',
  user: 'マイページヘルプ',
  shop: 'ショップ管理',
};

export async function generateMetadata({ params }: Props) {
  const { locale, slug } = await params;
  const filePath = path.join(process.cwd(), 'content', 'help', locale, ...slug, 'index.md');

  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const { data } = matter(fileContent);
    const t = await getTranslations({ locale, namespace: 'Metadata' });

    return {
      title: `${data.title} | ${t('title')}`,
    };
  } catch (e) {
    return {
      title: 'Help',
    };
  }
}

export default async function DynamicHelpPage({ params }: Props) {
  const { locale, slug } = await params;
  const filePath = path.join(process.cwd(), 'content', 'help', locale, ...slug, 'index.md');

  let fileContent: string;
  try {
    fileContent = await fs.readFile(filePath, 'utf-8');
  } catch (e) {
    notFound();
  }

  const { data, content } = matter(fileContent);

  // Determine category icon based on root slug
  const category = slug[0];
  const Icon = CategoryIconMap[category];
  const categoryTitle = CategoryTitleMap[category];

  // Determine parent link
  const parentSlug = slug.slice(0, -1);
  let parentPath = parentSlug.length > 0 ? `/help/${parentSlug.join('/')}` : '/help';

  const backLabel = parentSlug.length > 0 ? '戻る' : 'ヘルプのトップに戻る';

  return (
    <div className="min-h-screen bg-background pb-20 pt-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        {/* Header Section */}
        <div className="mb-8">
          <Link
            href={parentPath}
            className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground mb-4 transition-colors"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {backLabel}
          </Link>
        </div>

        <div className="flex-grow font-sans">
          <MarkdownRenderer content={content} categoryIcon={Icon} categoryTitle={categoryTitle} />
        </div>

        {/* Footer Section */}
        <div className="mt-12 pt-8 border-t flex flex-col items-center gap-4">
          <Link
            href={parentPath}
            className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {backLabel}
          </Link>

          {slug[0] === 'shop' && (
            <Link href="/shop" className="mt-4">
              <Button variant="outline" className="rounded-full px-8">
                ショップ管理画面に戻る
              </Button>
            </Link>
          )}

          {slug[0] === 'admin' && (
            <Link href="/admin" className="mt-4">
              <Button variant="outline" className="rounded-full px-8">
                管理者画面に戻る
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
