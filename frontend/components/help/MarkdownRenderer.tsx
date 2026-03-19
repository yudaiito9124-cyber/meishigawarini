import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { remark } from 'remark';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeReact from 'rehype-react';
import * as prod from 'react/jsx-runtime';
import { ArrowLeft, ArrowRight, BookOpen, Settings, ChevronRight, Store, Package, Bug } from 'lucide-react';

import { HelpImage } from './HelpImage';

const IconMap: Record<string, React.ElementType> = {
  store: Store,
  package: Package,
  bug: Bug,
  book: BookOpen,
  settings: Settings,
};

const production = {
  Fragment: prod.Fragment,
  jsx: prod.jsx,
  jsxs: prod.jsxs,
  components: {
    h1: ({ children }: any) => (
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl text-center mb-4">
        {children}
      </h1>
    ),
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
    h4: ({ children }: any) => (
      <h4 className="text-lg font-bold mb-4 mt-6 border-b pb-2">
        {children}
      </h4>
    ),
    h5: ({ children }: any) => (
      <h5 className="text-lg font-semibold mb-2 mt-4 opacity-80">
        {children}
      </h5>
    ),
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
    img: ({ src, alt }: any) => <HelpImage src={src} alt={alt} />,
    a: ({ href, children, className, 'data-icon': dataIcon }: any) => {
      const isInternal = href?.startsWith('/');
      
      // Premium Help Card styling
      if (className === 'card-help') {
        const Icon = dataIcon ? IconMap[dataIcon] : ChevronRight;
        return (
          <Link href={href} className="group relative rounded-xl border bg-card p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-md block h-full">
            {Icon && (
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-6 w-6" />
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

      if (isInternal) {
        return (
          <Link href={href} className="text-primary hover:underline font-medium">
            {children}
          </Link>
        );
      }
      return (
        <a 
          href={href} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-primary hover:underline font-medium"
        >
          {children}
        </a>
      );
    },
    section: ({ children, className }: any) => {
        if (className === 'notice') {
            return (
                <section className="rounded-lg bg-primary/5 p-6 border border-primary/20 my-6">
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
            <div className="grid gap-6 md:grid-cols-2 mb-10">
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
    ul: ({ children }: any) => (
      <ul className="list-disc list-inside mb-4 space-y-1 opacity-90">
        {children}
      </ul>
    ),
    ol: ({ children }: any) => (
      <ol className="list-decimal list-inside mb-4 space-y-1 opacity-90">
        {children}
      </ol>
    ),
  },
};

export async function MarkdownRenderer({ content, className }: { content: string; className?: string }) {
  const file = await remark()
    .use(remarkParse)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeReact, production as any)
    .process(content);

  return <div className={className}>{file.result}</div>;
}
