/**
 * ファイル概要: ヘルプページ用画像コンポーネント (HelpImage)
 * 
 * 役割:
 * Markdown からレンダリングされた画像を美しくスタイリングして表示します。
 * 角丸、シャドウの適用、キャプション（alt）の表示、およびズーム表示（モーダルダイアログ）をサポートします。
 * また、画像リンクが切れている、あるいは画像が存在しない場合には自動的にデフォルトの
 * 「画像準備中」プレースホルダー画像にフォールバックします。
 * 
 * コンテキスト:
 * `MarkdownRenderer` の img タグマッピングにて使用されます。
 * 
 * 改善点:
 * スマートフォン等のモバイル端末での操作性向上のため、ズーム・パン・ピンチ操作をサポートする
 * `react-zoom-pan-pinch` を導入しました。また、縦長画像表示時に閉じるボタンが見切れて
 * 戻れなくなる不具合を解消するため、セーフエリア対応のフローティング閉じるボタンの実装、
 * および画像外の背景領域をクリックした際にモーダルを閉じる処理を実装しています。
 */

"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ExternalLink, X, Maximize2 } from "lucide-react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

interface HelpImageProps {
  src: string;
  alt?: string;
}

/**
 * 画像キャプション（alt）に含まれるURLを検出し、自動的にハイパーリンクに変換してレンダリングします。
 * URL以外のテキストはそのままプレーンテキストとして描画されます。
 */
const renderTextWithLinks = (text: string) => {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.split(urlRegex).map((part, i) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-2 text-blue-500 hover:underline underline-offset-4 font-medium break-all"
        >
          <ExternalLink className="inline-block h-4 w-4 justify-center items-center" />  {part}
        </a>
      );
    }
    return part;
  });
};

export function HelpImage({ src, alt }: HelpImageProps) {
  // モーダル（ダイアログ）の開閉状態を管理
  const [isOpen, setIsOpen] = useState(false);
  // 画像のソースURLを動的に管理するための状態
  const [imgSrc, setImgSrc] = useState(src);
  // エラーハンドラーの無限ループを防ぐためのフラグ
  const [hasError, setHasError] = useState(false);

  // 外部からの src プロパティ変更に追従して状態を更新
  useEffect(() => {
    setImgSrc(src);
    setHasError(false);
  }, [src]);

  // 画像読み込みエラー発生時にプレースホルダー画像へ切り替える処理
  const handleError = () => {
    if (!hasError) {
      setImgSrc('/images/placeholder.webp');
      setHasError(true);
    }
  };

  return (
    <span className="block mb-10 mt-5">
      <span className="block overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:shadow-md">
        {alt && (
          <span className="block px-4 py-2 border-b bg-muted/30 text-sm text-primary font-medium leading-relaxed">
            {renderTextWithLinks(alt)}
          </span>
        )}

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <button className="group relative block w-full aspect-video bg-muted/10 cursor-zoom-in text-left">
              {/* ホバー時にズームイン可能なことを示すアイコンオーバーレイを表示 */}
              <div className="absolute inset-0 z-10 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 bg-black/5">
                <div className="rounded-full bg-white/90 p-2 shadow-lg">
                  <Maximize2 className="h-5 w-5 text-gray-700" />
                </div>
              </div>
              <img
                src={imgSrc}
                alt={alt || ''}
                className="h-full w-full object-contain block"
                loading="lazy"
                onError={handleError}
              />
            </button>
          </DialogTrigger>
          {/* プレビューモーダル本体の定義 */}
          {/* w-screen h-screen で画面全体をカバーし、デフォルトの閉じるボタンは非表示にします */}
          <DialogContent 
            className="max-w-screen max-h-screen w-screen h-screen p-0 border-none bg-transparent shadow-none flex items-center justify-center"
            showCloseButton={false}
          >
            <DialogTitle className="sr-only">Image Preview</DialogTitle>
            <DialogDescription className="sr-only">Lightbox view of: {alt || 'Help content image'}</DialogDescription>
            {/* 背景のクリックでモーダルを閉じるための全画面コンテナ */}
            <div 
              className="relative w-screen h-screen flex flex-col items-center justify-center bg-black/85"
              onClick={() => setIsOpen(false)}
            >
              {/* カスタム閉じるボタン: 右上のセーフエリアを考慮した位置に固定表示 */}
              {/* タップ領域を広めに取り、半透明の背景を敷くことで白系画像や暗い背景のどちらでも視認可能にします */}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="fixed top-[calc(env(safe-area-inset-top,16px)+16px)] right-[calc(env(safe-area-inset-right,16px)+16px)] z-50 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors border border-white/10 focus:outline-none focus:ring-2 focus:ring-white cursor-pointer"
                aria-label="閉じる"
              >
                <X className="h-6 w-6" />
              </button>

              {/* 画像表示とズーム操作を行うコンテナ領域。クリックイベントの親への伝播を防止します */}
              <div 
                className="w-full h-[80vh] flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <TransformWrapper
                  initialScale={1}
                  minScale={1}
                  maxScale={5}
                  centerOnInit={true}
                >
                  <TransformComponent
                    wrapperStyle={{ width: "100%", height: "100%" }}
                    contentStyle={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <img
                      src={imgSrc}
                      alt={alt || ''}
                      className="max-w-full max-h-[80vh] mx-auto rounded-lg shadow-2xl object-contain bg-white cursor-grab active:cursor-grabbing"
                      onError={handleError}
                    />
                  </TransformComponent>
                </TransformWrapper>
              </div>

              {/* キャプションが存在する場合は下部に表示。クリックイベントの親への伝播を防止します */}
              {alt && (
                <div 
                  className="mt-4 px-4 py-2 bg-black/60 backdrop-blur-md rounded-full text-white text-sm max-w-[80vw] text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  {alt}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </span>
    </span>
  );
}
