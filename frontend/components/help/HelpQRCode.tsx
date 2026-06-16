/**
 * HelpQRCode.tsx
 * 
 * 【役割】
 * ヘルプ内のリンクの直後に動的なQRコードをレンダリングするコンポーネントです。
 * PC画面からのスキャンや、マニュアル印刷時のスキャン性を向上させます。
 * 
 * 【動作仕様】
 * 1. リンク（href）が相対パスの場合は、クライアントサイドで現在の origin を付与して完全な URL に解決します。
 * 2. `qrcode` ライブラリを用いてクライアントサイドで動的に QR コード画像を生成します。
 * 3. 画面表示時は通常 28px 四方の極小サイズで表示され、ホバーまたはクリックで 148px 四方に滑らかに拡大します。
 * 4. 印刷時は 64px 四方のスキャン可能サイズでそのまま印刷されるよう、CSSメディアクエリを適用します。
 */

'use client';

import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';

interface HelpQRCodeProps {
  /** 対象リンクのURL */
  href: string;
  /** ポップアップの展開位置 ('top' | 'bottom')。デフォルトは 'top' */
  popupAlign?: 'top' | 'bottom';
}

export function HelpQRCode({ href, popupAlign = 'top' }: HelpQRCodeProps) {
  // 生成されたQRコードのData URLを保持するステート
  const [qrSrc, setQrSrc] = useState<string>('');
  
  // 読み込み中状態を管理するステート
  const [isLoading, setIsLoading] = useState<boolean>(true);
  
  // モバイル端末等でのクリックによる拡大表示のトグル状態を管理するステート
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  
  // コンポーネントの外側がクリックされたことを検知するための参照
  const containerRef = useRef<HTMLDivElement>(null);

  // hrefから絶対URLを解決する処理と、QRコードの生成処理をマウント時に実行
  useEffect(() => {
    let active = true;

    const generateQRCode = async () => {
      try {
        setIsLoading(true);
        
        let absoluteUrl = href;
        // 相対パス（/で始まるもの）の場合、現在のoriginを結合して完全なURLにする
        if (href.startsWith('/')) {
          absoluteUrl = `${window.location.origin}${href}`;
        }

        // qrcodeライブラリを使用してData URLを生成
        // スキャン精度を高めるためにエラー訂正レベルを M (Medium) に設定
        const dataUrl = await QRCode.toDataURL(absoluteUrl, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 148, // 拡大時のサイズに合わせる
        });

        if (active) {
          setQrSrc(dataUrl);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Failed to generate QR code:', err);
        if (active) {
          setIsLoading(false);
        }
      }
    };

    generateQRCode();

    // クリーンアップ処理
    return () => {
      active = false;
    };
  }, [href]);

  // コンポーネント外クリックを監視して、拡大状態を閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // 読み込み中の場合は、スケルトンを表示
  if (isLoading) {
    return (
      <span 
        className="inline-block w-7 h-7 bg-muted animate-pulse rounded border border-border align-middle ml-1.5 shrink-0 print:hidden" 
      />
    );
  }

  // QRコードが生成できなかった場合は何も描画しない
  if (!qrSrc) {
    return null;
  }

  return (
    <span 
      ref={containerRef}
      className="relative inline-block align-middle ml-1.5 shrink-0 select-none group"
    >
      {/* 画面上のトリガー要素：サイズを常に w-7 h-7 に固定し、配置を動かさない */}
      <span
        onClick={() => setIsExpanded(!isExpanded)}
        className="inline-block w-7 h-7 rounded border border-gray-200 bg-white p-0.5 shadow-sm cursor-pointer print:hidden"
      >
        <img
          src={qrSrc}
          alt="QR Code Trigger"
          className="w-full h-full object-contain bg-white rounded-sm"
        />
      </span>

      {/* ホバーまたはクリック時に表示されるポップアップ要素 */}
      {/* pointer-events-none を付与し、チャタリング（点滅）を完全に防止 */}
      <span
        className={`
          print:hidden
          pointer-events-none
          absolute z-50 w-[148px] h-[148px] p-1 rounded-lg border border-primary bg-white shadow-2xl
          transition-all duration-300 ease-out
          ${popupAlign === 'bottom'
            ? 'top-full left-1/2 -translate-x-1/2 mt-2 origin-top'
            : 'bottom-full right-1/2 translate-x-1/2 mb-2 origin-bottom'
          }
          ${isExpanded 
            ? 'opacity-100 scale-100 visible'
            : 'opacity-0 scale-75 invisible md:group-hover:opacity-100 md:group-hover:scale-100 md:group-hover:visible'
          }
        `}
      >
        <img
          src={qrSrc}
          alt="QR Code Expanded"
          className="w-full h-full object-contain bg-white rounded-md"
        />
      </span>

      {/* モバイルでトグル（クリック）展開した時のみ、外側クリックを処理するための背景オーバーレイ */}
      {isExpanded && (
        <span 
          className="fixed inset-0 bg-black/20 z-40 md:hidden print:hidden"
          onClick={() => setIsExpanded(false)}
        />
      )}

      {/* 印刷用のQRコード表示：印刷時のみ出現し、画面上では非表示。サイズを w-24 h-24（約96px）へ拡大 */}
      <span className="hidden print:inline-block border border-gray-300 bg-white p-1 rounded ml-2 w-24 h-24 align-middle shrink-0">
        <img
          src={qrSrc}
          alt="QR Code for printing"
          className="w-full h-full object-contain"
        />
      </span>
    </span>
  );
}
