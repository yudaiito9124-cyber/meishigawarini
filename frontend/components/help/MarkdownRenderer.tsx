/**
 * MarkdownRenderer.tsx
 * 
 * 【役割】
 * Markdownコンテンツを、プロジェクトの独自コンポーネントやスタイルにマッピングして
 * 動的にレンダリングするエンジンです。HelpページやAdminマニュアルで使用されます。
 * 
 * 【技術スタック】
 * - remark: Markdownのパース用
 * - rehype: HTMLへの変換およびReactコンポーネントへの接続用
 * - Mermaid: フローチャート等の動的生成用
 * 
 * 【マッピング設計】
 * 標準のHTMLタグ（h1, p, img等）や、特定のクラス名（notice, benefit等）を
 * 独自のReactコンポーネントに差し替えます。詳細は各コンポーネントのコメントを参照してください。
 */

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { remark } from 'remark';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeReact from 'rehype-react';
import * as prod from 'react/jsx-runtime';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Settings,
  ChevronRight,
  Store,
  Package,
  Bug,
  ExternalLink,
  ArrowUpRight,
  Waypoints,
  SendHorizontal,
  CircleUserRound,
  Crown,
  Gift,
  QrCode,
  Truck
} from 'lucide-react';

import { HelpImage } from './HelpImage';
import { Mermaid } from './Mermaid';

/**
 * アイコン名とLucideReactアイコンの定義表。
 * aタグの data-icon 属性などで使用されます。
 */
const IconMap: Record<string, React.ElementType> = {
  store: Store,
  package: Package,
  bug: Bug,
  book: BookOpen,
  settings: Settings,
  waypoints: Waypoints,
  send: SendHorizontal,
  user: CircleUserRound,
  crown: Crown,
  gift: Gift,
  qrcode: QrCode,
  truck: Truck,
};

const production = {
  Fragment: prod.Fragment,
  jsx: prod.jsx,
  jsxs: prod.jsxs,
};

/**
 * メインレンダラーコンポーネント
 */
export async function MarkdownRenderer({ 
  content, 
  className, 
  categoryIcon: Icon, 
  categoryTitle,
  mermaidVariant = 'light'
}: { 
  content: string; 
  className?: string; 
  categoryIcon?: React.ElementType; 
  categoryTitle?: string;
  mermaidVariant?: 'light' | 'dark';
}) {
  const components = {
    /**
     * ページタイトル (H1)
     * - 中央寄せ、マージン大
     * - propsから渡されたカテゴリ用アイコンとタイトルを表示
     */
    h1: ({ children }: any) => (
      <div className="flex flex-col items-center mb-8">
        {Icon && (
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary shadow-sm">
            <Icon className="h-8 w-8" />
          </div>
        )}
        {categoryTitle && (
          <span className="text-sm font-bold uppercase tracking-widest text-primary/60 mb-2">
            {categoryTitle}
          </span>
        )}
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl text-center">
          {children}
        </h1>
      </div>
    ),
    /**
     * 見出し2 (H2)
     * - 標準: 下線付き、上部余白大
     * - .card-title クラス: カード内でのタイトル用スタイルに切り替え
     */
    h2: ({ children, className }: any) => {
      if (className === 'card-title') {
        return (
          <h2 className="text-2xl font-bold tracking-tight group-hover:text-primary transition-colors mb-2 mt-0">
            {children}
          </h2>
        );
      }
      return (
        <h2 className="mb-6 border-b pb-2 text-2xl font-bold tracking-tight mt-12 first:mt-0">
          {children}
        </h2>
      );
    },
    /**
     * 見出し3 (H3) - 自動アイコン化
     * - 先頭が数字（例: ### 1 手順）で始まる場合、その数字を丸数字のアイコンとして表示します。
     */
    h3: ({ children }: any) => {
      const flatten = (nodes: any): string => {
        if (Array.isArray(nodes)) return nodes.map(flatten).join('');
        if (typeof nodes === 'string') return nodes;
        if (nodes?.props?.children) return flatten(nodes.props.children);
        return '';
      };

      const text = flatten(children).trim();
      const match = text.match(/^(\d+)/);
      if (match) {
        const num = match[1];
        return (
          <h3 className="text-xl font-semibold mb-3 flex items-center gap-2 mt-8">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {num}
            </span>
            {text.replace(/^(\d+)/, '').trim()}
          </h3>
        );
      }
      return <h3 className="text-xl font-semibold mb-4 border-b-0 mt-8">{children}</h3>;
    },
    /** 見出し4 (H4): セクション内の小分類用 */
    h4: ({ children }: any) => (
      <h4 className="text-lg font-bold mb-4 mt-6 border-b pb-2">
        {children}
      </h4>
    ),
    /** 見出し5 (H5): リストの見出し等 */
    h5: ({ children }: any) => (
      <h5 className="text-lg font-semibold mb-2 mt-4 opacity-80">
        {children}
      </h5>
    ),
    /**
     * 本文段落 (P)
     * - 標準: 読みやすさを重視した行間設定
     * - .lead クラス: 特徴的なリード文として中央寄せ・少し大きめの文字（HTML injectionが必要）
     */
    p: ({ children, className }: any) => {
      if (className === 'lead') {
        return <p className="mt-4 text-lg opacity-80 text-center mb-10">{children}</p>;
      }
      return (
        <p className="mb-4 opacity-90 leading-relaxed">
          {children}
        </p>
      );
    },
    /** 画像表示: HelpImageコンポーネント（角丸、シャドウ、最大幅制限）へマッピング */
    img: ({ src, alt }: any) => <HelpImage src={src} alt={alt} />,
    /**
     * リンク (A)
     * - .card-help クラス: カード形式のプレミアムなリンク（アイコン付き、ホバーエフェクト）
     * - data-icon 属性: IconMapからアイコンを指定可能
     * - 内部/外部リンクの自動判別:
     *   - 外部リンクには ExternalLink アイコンを付与。
     *   - 非マニュアル系内部リンクには背景色と ArrowUpRight を付与。
     */
    a: ({ href, children, className, 'data-icon': dataIcon }: any) => {
      const isInternal = href?.startsWith('/');

      // 特殊: ヘルプカード（リッチな誘導リンク）
      if (className === 'card-help') {
        const CardIcon = dataIcon ? IconMap[dataIcon] : ChevronRight;
        return (
          <Link href={href} className="group relative rounded-xl border bg-card p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-md block h-full">
            {CardIcon && (
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CardIcon className="h-6 w-6" />
              </div>
            )}
            <div className="space-y-2">
              {children}
            </div>
            <div className="mt-6 flex items-center text-sm font-medium text-primary">
              マニュアルを見る
              <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>
        );
      }

      // 独自のカスタムクラスが指定されている場合はそれを尊重
      if (className && className !== 'card-help') {
        return (
          <Link href={href} className={className}>
            {children}
          </Link>
        );
      }

      if (isInternal) {
        // マニュアル内移動とアプリケーション機能への誘導を視覚的に区別
        const isManualLink = href.startsWith('/help') || href.startsWith('/admin/help');

        return (
          <Link
            href={href}
            className={`
              inline-flex items-center font-bold text-primary 
              underline decoration-primary/30 underline-offset-4 
              hover:decoration-primary transition-all
              ${isManualLink ? '' : 'bg-primary/5 px-1 rounded mx-0.5'}
            `}
          >
            {children}
            {!isManualLink && <ArrowUpRight className="ml-0.5 h-3 w-3 opacity-70" />}
          </Link>
        );
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center font-bold text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary transition-all px-1"
        >
          {children}
          <ExternalLink className="ml-1 h-3 w-3 opacity-70" />
        </a>
      );
    },
    /**
     * 特殊セクション (SECTION)
     * - .notice: 通知・注意書き（薄い背景色、枠線）
     * - .benefit: メリット紹介（グラデーション背景、中央寄せ）
     * - .hero: 強調ヒーローセクション（ブランドカラー背景、白抜き文字）
     * - .manual-container: グループ化されたマニュアルブロック（シャドウ・枠線）
     */
    section: ({ children, className }: any) => {
      if (className === 'notice') {
        return (
          <section className="rounded-lg bg-primary/5 p-6 border border-primary/20 my-6">
            {children}
          </section>
        );
      }
      if (className === 'benefit') {
        return (
          <section className="rounded-2xl bg-gradient-to-br from-card/100 via-card/50 to-background/30 p-8 border-none border-primary/20 my-0  text-center">
            {children}
          </section>
        );
      }
      if (className === 'hero') {
        return (
          <section className="p-10 text-3xl bg-primary text-primary-foreground rounded-2xl shadow-xl text-center items-center mb-2">
            {children}
          </section>
        );
      }
      if (className === 'manual-container') {
        return (
          <div className="space-y-12 rounded-xl bg-card p-6 shadow-sm border sm:p-10">
            {children}
          </div>
        );
      }
      return <section className={className}>{children}</section>;
    },
    /**
     * 汎用コンテナ (DIV)
     * - .notice-inner: notice内の1行強調表示用
     * - .grid-help: ヘルプカードの整列用
     * - .card-footer: ページ下部の誘導エリア
     */
    div: ({ children, className }: any) => {
      if (className === 'notice-inner') {
        return (
          <div className="flex items-center justify-between rounded bg-background p-3 shadow-inner">
            {children}
          </div>
        );
      }
      if (className === 'grid-help') {
        return (
          <div className="grid gap-2 md:grid-cols-1 mb-10 mt-0">
            {children}
          </div>
        );
      }
      if (className === 'card-footer') {
        return (
          <div className="grid gap-6 md:grid-cols-1 mt-10">
            {children}
          </div>
        );
      }
      return <div className={className}>{children}</div>;
    },
    /** 箇条書き: 読みやすさを考慮したスペーシング */
    ul: ({ children }: any) => (
      <ul className="list-disc list-inside mb-4 space-y-1 opacity-90">
        {children}
      </ul>
    ),
    /** 番号付きリスト */
    ol: ({ children }: any) => (
      <ol className="list-decimal list-inside mb-4 space-y-1 opacity-90">
        {children}
      </ol>
    ),
    /**
     * コードブロック (CODE)
     * - language-mermaid が指定された場合、Mermaidコンポーネントで描画します。
     * - インラインコード等の標準的なものはそのまま出力。
     */
    code: ({ node, inline, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || '');
      const isMermaid = match && match[1] === 'mermaid';

      if (isMermaid) {
        return <Mermaid chart={String(children).replace(/\n$/, '')} variant={mermaidVariant} />;
      }

      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
    /** 整形済みテキスト (PRE): コードブロックの背景と余白 */
    pre: ({ children }: any) => <pre className="bg-muted p-4 rounded-lg overflow-x-auto my-6">{children}</pre>,
    /** 引用 (BLOCKQUOTE): 太めのアクセントボーダーとイタリック体 */
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-4 border-primary pl-6 py-2 my-8 italic text-lg opacity-90 leading-loose">
        {children}
      </blockquote>
    ),
  };

  const file = await remark()
    .use(remarkParse)
    .use(remarkRehype, { allowDangerousHtml: true }) // HTML injectionを許可
    .use(rehypeRaw)
    .use(rehypeReact, { ...production, components } as any)
    .process(content);

  return <div className={className}>{file.result}</div>;
}
