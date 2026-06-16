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
 * ドラッグ・スワイプ時の誤クローズを防ぐため、ポインターイベントによるドラッグ移動量検知を導入しています。
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
  // クリックとドラッグ操作を識別するためのポインター開始位置
  const [pointerStart, setPointerStart] = useState<{ x: number; y: number } | null>(null);

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

  // 背景でポインターが押し下げられた時の処理
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // マウスの左クリックまたはタッチ操作のみを対象とします
    if (e.button === 0) {
      setPointerStart({ x: e.clientX, y: e.clientY });
    }
  };

  // 背景でポインターが離された時の処理
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerStart) return;
    // ポインター移動量を計算します
    const dx = Math.abs(e.clientX - pointerStart.x);
    const dy = Math.abs(e.clientY - pointerStart.y);
    // 移動量が5ピクセル未満の場合は純粋なクリック・タップとみなし、モーダルを閉じます
    // ドラッグ操作（画像のスクロール移動など）の場合は閉じないようにします
    if (dx < 5 && dy < 5) {
      setIsOpen(false);
    }
    setPointerStart(null);
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
          <DialogContent 
            className="max-w-[calc(100vw-20px)] sm:max-w-[calc(100vw-20px)] max-h-[calc(100vh-20px)] w-[calc(100vw-20px)] h-[calc(100vh-20px)] p-0 border-none bg-transparent shadow-none flex items-center justify-center"
            showCloseButton={false}
          >
            <DialogTitle className="sr-only">Image Preview</DialogTitle>
            <DialogDescription className="sr-only">Lightbox view of: {alt || 'Help content image'}</DialogDescription>
            {/* 背景のクリックでモーダルを閉じるための全画面コンテナ */}
            {/* 画面端に20pxの余白を持たせるため、w-full h-full で角丸とシャドウを適用します */}
            <div 
              className="relative w-full h-full flex flex-col items-center justify-center bg-black/90 select-none rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
            >
              {/* カスタム閉じるボタン: 黒いコンテナの右上（absolute）に固定表示 */}
              {/* コンテナ自体が画面内に収まるため、absolute 配置で完全に見切れを防ぎます */}
              {/* 背景のポインターイベントとの競合を防ぐため、イベント伝播をブロックします */}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                className="absolute top-10 right-10 z-50 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors border border-white/10 focus:outline-none focus:ring-2 focus:ring-white cursor-pointer"
                aria-label="閉じる"
              >
                <X className="h-6 w-6" />
              </button>

              {/* 画像表示とズーム操作を行うコンテナ領域 */}
              {/* 内部操作が背景に漏れるのを防ぐため、各種ポインターイベントの伝播をブロックします */}
              {/* 親の高さに合わせて自動調整されるように flex-1 を指定します */}
              <div 
                className="w-full flex-1 flex items-center justify-center p-4"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
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
                      className="max-w-full max-h-[70vh] mx-auto rounded-lg shadow-2xl object-contain bg-white cursor-grab active:cursor-grabbing"
                      onError={handleError}
                      onPointerDown={(e) => e.stopPropagation()}
                      onPointerUp={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </TransformComponent>
                </TransformWrapper>
              </div>

              {/* キャプションが存在する場合は下部に表示。イベント伝播をブロックします */}
              {alt && (
                <div 
                  className="mb-6 px-4 py-2 bg-black/60 backdrop-blur-md rounded-full text-white text-sm max-w-[80vw] text-center"
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
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
