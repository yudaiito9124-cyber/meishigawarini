/**
 * ファイル概要: 動的ヘルプマニュアル・レンダリングページ
 * 
 * 役割:
 * 指定されたパス (slug) に基づいて、プロジェクト内の Markdown ファイルを読み込み、
 * ヘルプ記事としてレンダリングします。
 * 
 * 仕組み:
 * 1. URL の [...slug] から `content/help/{locale}/{slug}/index.md` を特定。
 * 2. gray-matter で Frontmatter (title等) と本文を分離。
 * 3. カテゴリ（第1階層のslug）に応じてアイコンとタイトルを選択。
 * 4. MarkdownRenderer で本文（Mermaid図式、Sanitized HTML含む）を表示。
 */

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

/** カテゴリ（ルートパス）とアイコンの対応定義 */
const CategoryIconMap: Record<string, React.ElementType> = {
  overview: Waypoints,
  receive: Gift,
  send: SendHorizontal,
  user: CircleUserRound,
  shop: Store,
  admin: Crown,
};

/** カテゴリと日本語タイトルの対応定義 */
const CategoryTitleMap: Record<string, string> = {
  overview: '新しいギフト体験「名刺代わりに。」とは',
  receive: 'ギフトの受け取り方',
  send: 'ギフトの贈り方',
  user: 'マイページの使い方',
  shop: 'ショップ運用マニュアル',
};

/**
 * MarkdownのFrontmatterからタイトルを抽出し、メタデータを生成します。
 */
export async function generateMetadata({ params }: Props) {
  const { locale, slug } = await params;
  // index.md 形式のファイルパスを構築
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

/**
 * 動的原稿（Markdown）を読み込んで表示するメインコンポーネント
 */
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
        <div className="mb-8 print:hidden">
          <Link
            href={parentPath}
            className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground mb-4 transition-colors"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {backLabel}
          </Link>
        </div>

        <div className="flex-grow font-sans help-content">
          <MarkdownRenderer 
            content={content} 
            categoryIcon={Icon} 
            categoryTitle={categoryTitle} 
            mermaidVariant="light"
            currentPath={`/help/${slug.join('/')}`}
          />
        </div>

        {/* Footer Section */}
        <div className="mt-12 pt-8 border-t flex flex-col items-center gap-4 print:hidden">
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
