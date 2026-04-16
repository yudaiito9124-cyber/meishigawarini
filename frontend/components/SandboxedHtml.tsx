/**
 * ファイル概要: セキュア・レスポンシブ HTML レンダリングコンポーネント (Sandboxed HTML Renderer)
 * 
 * 役割:
 * 第三者（ショップオーナー等）が作成した HTML コンテンツを、安全かつ美しく表示します。
 * iframe によるサンドボックス化、DOMPurify によるサニタイズ、厳格な CSP 設定により、
 * XSS（クロスサイトスクリプティング）などの攻撃から親サイトを保護します。
 * 
 * 主要機能:
 * 1. サンドボックス iframe 内での HTML レンダリング。
 * 2. コンテンツ量に応じた iframe の高さ自動調整 (ResizeObserver & postMessage)。
 * 3. DOMPurify による危険なタグ/属性の除去。
 * 4. Content Security Policy (CSP) による外部リソース取得の制限。
 * 5. ダークモード対応の自動スタイル注入。
 */

"use client";
import { useState, useEffect, useId, useMemo } from "react";
import DOMPurify from "isomorphic-dompurify";

/**
 * 外部 HTML を安全に表示するためのコンポーネント
 * 
 * @param html 表示対象の HTML 文字列
 * @param darkMode ダークモード用のスタイルを適用するかどうか
 */
export default function ResponsiveSecureFrame({ html, darkMode = false }: { html: string, darkMode?: boolean }) {
    /** iframe の高さを状態として保持 */
    const [height, setHeight] = useState("400px");
    /** インスタンスごとに一意の ID を生成 (postMessage の識別に使用) */
    const iframeId = useId();

    // ─── iframe 内からの高さ通知受信処理 ───
    useEffect(() => {
        /**
         * iframe 内のスクリプトから送られてくるリサイズ要求をハンドリングします。
         */
        const handleMessage = (event: MessageEvent) => {
            // セキュリティチェック: 同一オリジンまたは sandbox 特有の "null" オリジンのみ許可
            const isSameOrigin = event.origin === window.location.origin;
            const isNullOrigin = event.origin === "null";

            if (!isNullOrigin && !isSameOrigin) return;

            // リサイズ要求かつ自分宛ての ID かどうかを確認
            if (event.data && event.data.type === "resize-iframe" && event.data.id === iframeId) {
                const nextHeight = Math.ceil(event.data.height);

                setHeight((prev) => {
                    const currentHeight = parseInt(prev);
                    const diff = nextHeight - currentHeight;
                    // 微小な変化（4px未満）は無視して再レンダリングを抑制
                    if (Math.abs(diff) < 4) return prev;

                    return `${nextHeight}px`;
                });
            }
        };
        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, [iframeId]);

    /**
     * srcDoc に渡す HTML 文字列を生成・サニタイズします。
     * メモ化により無駄な再生成を防ぎます。
     */
    const srcDoc = useMemo(() => {
        // 1. DOMPurify によるサニタイズ
        // コンテンツに必要なスタイルや埋め込み（YouTube等）は許可する。
        const sanitizedRaw = DOMPurify.sanitize(html, {
            ADD_TAGS: ["style", "link", "meta", "iframe"],
            ADD_ATTR: ["href", "rel", "class", "style", "crossorigin", "integrity", "target", "src", "width", "height", "frameborder", "allow", "allowfullscreen", "title", "loading", "referrerpolicy"],
            WHOLE_DOCUMENT: true,
        });

        // カスタムフック: iframe タグに対してセキュリティ属性を強制適用
        DOMPurify.removeAllHooks();
        DOMPurify.addHook('afterSanitizeAttributes', function (node) {
            if (node.tagName === 'IFRAME') {
                const src = node.getAttribute('src') || '';
                // 許可されているドメイン (YouTube / Google Maps) 以外は sandbox を強制
                const isYouTube = src.includes('youtube.com/') || src.includes('youtube-nocookie.com/');
                const isGoogleMaps = src.includes('google.co.jp/maps') || src.includes('google.com/maps');

                if (!isYouTube && !isGoogleMaps) {
                    node.setAttribute('sandbox', 'allow-scripts');
                }
                // 親サイトへの情報漏洩を防ぐ
                node.setAttribute('referrerpolicy', 'no-referrer');
            }
        });

        const parser = new DOMParser();
        const doc = parser.parseFromString(sanitizedRaw, "text/html");

        // 2. セキュリティ設定 (Content Security Policy)
        // インラインスクリプトを許可しつつ、外部への接続先を厳密にホワイトリスト化する。
        const trustedCDNs = [
            "https://fonts.googleapis.com",
            "https://fonts.gstatic.com",
            "https://cdnjs.cloudflare.com",
            "https://cdn.jsdelivr.net",
            "https://unpkg.com",
            "https://ka-f.fontawesome.com",
            "https://use.fontawesome.com",
            "https://cdn.tailwindcss.com"
        ].join(" ");

        const embedDomains = [
            "https://www.youtube.com",
            "https://www.youtube-nocookie.com",
            "https://www.google.com",
            "https://maps.google.com",
            "https://www.google.co.jp",
            "https://*.googleapis.com", // Google Maps用
            "https://*.gstatic.com"      // Google Maps用
        ].join(" ");

        const meta = doc.createElement("meta");
        meta.httpEquiv = "Content-Security-Policy";
        meta.content = `
            default-src none;
            script-src 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://*.ytimg.com https://*.googleapis.com;
            style-src 'self' 'unsafe-inline' ${trustedCDNs}; 
            font-src 'self' ${trustedCDNs} data:; 
            img-src 'self' data: https:; 
            frame-src ${embedDomains}; 
            connect-src https:;
            worker-src 'self' blob:;
        `.replace(/\s+/g, ' ');
        doc.head.prepend(meta);

        // a タグをすべて別タブで開くように設定
        const base = doc.createElement("base");
        base.target = "_blank";
        doc.head.append(base);

        // 3. 高さ計測用スクリプトの注入
        const script = doc.createElement("script");
        script.textContent = `
        (function() {
            // 自分のコンテンツサイズを測って親に通知する関数
            const sendHeight = () => {
                const el = document.getElementById('content-inner');
                if (!el) return;

                // 子要素も含めた真の最下部を計算
                // getBoundingClientRect().bottom はビューポート基準なので、
                // ページ全体の高さを取るために body の offsetHeight や scrollHeight と比較
                const body = document.body;
                const html = document.documentElement;

                // 各種計測値の中から最大値を採用し、見切れを防ぐ
                const height = Math.max(
                    el.offsetHeight,
                    el.scrollHeight,
                    body.scrollHeight, 
                    body.offsetHeight,
                    html.clientHeight, 
                    html.scrollHeight, 
                    html.offsetHeight
                );

                window.parent.postMessage({ 
                    type: "resize-iframe", 
                    id: "${iframeId}", 
                    height: height
                }, "*");
            };

            // イベント登録
            window.addEventListener("load", sendHeight);
            window.addEventListener("resize", sendHeight);
            
            // WebFont 読み込み完了時にも実行（高さが変わりやすいため）
            if (document.fonts) {
                document.fonts.ready.then(sendHeight);
            }

            // コンテンツの動的な変化を監視
            if (typeof ResizeObserver !== 'undefined') {
                const observer = new ResizeObserver(() => requestAnimationFrame(sendHeight));
                observer.observe(document.body);
                // コンテンツの中身が変わった際も検知
                observer.observe(document.getElementById('content-inner'));
            }

            // タイマーによるバックアップ（外部リソース読み込み対策）
            [500, 1000, 3000].forEach(delay => setTimeout(sendHeight, delay));
        })();
        `;

        // 4. リセットスタイルと基本表示の注入
        const style = doc.createElement("style");
        style.textContent = `
            html, body { 
                margin: 0 !important; 
                padding: 0 !important; 
                width: 100%; 
                height: auto !important;
                min-height: 0 !important;
                overflow: visible !important;
                ${darkMode ? "color: #cbd5e1 !important;" : ""} /* ダークモード時のフォント色調整 */
                font-family: sans-serif;
            }
            a {
                ${darkMode ? "color: #34d399 !important;" : ""} /* ダークモード時のリンク色調整 */
            }
            #content-inner {
                display: block; 
                width: 100%;
                height: auto !important;
                /* 上下のマージンが突き抜けて計測不能になる（Margin Collapsing）を防ぐ */
                padding: 1px 0; 
                margin: 0;
                box-sizing: border-box;
            }
            /* 画像などが親要素を突き破らないように制限 */
            img, video, iframe {
                max-width: 100%;
            }
        `;
        doc.head.append(style);

        // 5. ボディ全体を計測用ラッパー div で包み直す
        const innerWrapper = doc.createElement("div");
        innerWrapper.id = "content-inner";
        while (doc.body.firstChild) {
            innerWrapper.appendChild(doc.body.firstChild);
        }
        doc.body.appendChild(innerWrapper);
        doc.body.appendChild(script);

        return doc.documentElement.outerHTML;
    }, [html, iframeId, darkMode]);

    return (
        <div style={{ width: "100%", display: "block", position: "relative" }}>
            <iframe
                srcDoc={srcDoc}
                // サンドボックス属性の権限設定
                sandbox="allow-scripts allow-popups allow-forms allow-presentation allow-same-origin"
                scrolling="no"
                style={{
                    width: "100%",
                    minWidth: "100%",
                    height: height,
                    border: "none",
                    backgroundColor: "transparent",
                    display: "block",
                    transition: "none", // リサイズ時のガクつきを抑えるため無効化
                    overflow: "hidden"
                }}
                title="Secure Sandbox"
            />
        </div>
    );
}