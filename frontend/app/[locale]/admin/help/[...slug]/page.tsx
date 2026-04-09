import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { ArrowLeft, Home } from 'lucide-react';
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

export async function generateMetadata({ params }: Props) {
  const { locale, slug } = await params;
  const filePath = path.join(process.cwd(), 'content', 'admin-help', locale, ...slug, 'index.md');

  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const { data } = matter(fileContent);
    const t = await getTranslations({ locale, namespace: 'Metadata' });

    return {
      title: `${data.title} | Admin Help | ${t('title')}`,
    };
  } catch (e) {
    return {
      title: 'Admin Help',
    };
  }
}

export default async function AdminHelpPage({ params }: Props) {
  const { locale, slug } = await params;
  const filePath = path.join(process.cwd(), 'content', 'admin-help', locale, ...slug, 'index.md');

  let fileContent: string;
  try {
    fileContent = await fs.readFile(filePath, 'utf-8');
  } catch (e) {
    notFound();
  }

  const { data, content } = matter(fileContent);

  // Parent link logic
  const parentSlug = slug.slice(0, -1);
  const parentPath = parentSlug.length > 0 ? `/admin/help/${parentSlug.join('/')}` : '/admin/help';

  return (
    <div className="min-h-screen bg-mist-900 text-white pb-20 pt-10 px-4 sm:px-6 lg:px-10">
      <div className="max-w-4xl mx-auto">
        {/* Breadcrumb / Navigation */}
        <div className="flex justify-between items-center mb-10">
          <Link href={parentPath}>
            <Button variant="ghost" className="text-white/60 hover:text-white hover:bg-white/5">
              <ArrowLeft className="mr-2 h-4 w-4" />
              戻る
            </Button>
          </Link>
          <h1 className="text-xl font-bold opacity-40">管理者用ドキュメント</h1>
        </div>

        {/* Content Section */}
        <div className="bg-mist-200/10 border border-white/5 rounded-3xl p-8 sm:p-12 backdrop-blur-xl shadow-2xl overflow-hidden">
          <div className="mb-8 border-b border-white/10 pb-6">
            <h2 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
              {data.title || slug[slug.length - 1]}
            </h2>
          </div>

          <div className="prose prose-invert max-w-none ">
            <MarkdownRenderer content={content} />
          </div>
        </div>

        {/* Bottom Navigation */}
        <div className="mt-12 flex justify-center">
          <Link href="/admin">
            <Button variant="outline" className="bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white rounded-full px-8">
              <Home className="mr-2 h-4 w-4" />
              管理者ダッシュボードに戻る
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
