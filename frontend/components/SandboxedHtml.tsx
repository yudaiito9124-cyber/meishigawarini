"use client";
import { useState, useEffect, useId, useMemo } from "react";
import DOMPurify from "isomorphic-dompurify";





export default function ResponsiveSecureFrame({ html, darkMode = false }: { html: string, darkMode?: boolean }) {
    const [height, setHeight] = useState("400px");
    const iframeId = useId();

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            // sandboxに allow-same-origin がある場合はオリジンが親と同じになる
            const isSameOrigin = event.origin === window.location.origin;
            const isNullOrigin = event.origin === "null";

            if (!isNullOrigin && !isSameOrigin) return;

            if (event.data && event.data.type === "resize-iframe" && event.data.id === iframeId) {
                // React側の setHeight 部分
                const nextHeight = Math.ceil(event.data.height); // +2を一旦消す

                setHeight((prev) => {
                    const currentHeight = parseInt(prev);
                    const diff = nextHeight - currentHeight;
                    if (Math.abs(diff) < 4) return prev;

                    return `${nextHeight}px`;
                });
            }
        };
        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, [iframeId]);

    const srcDoc = useMemo(() => {
        const sanitizedRaw = DOMPurify.sanitize(html, {
            ADD_TAGS: ["style", "link", "meta", "iframe"],
            ADD_ATTR: ["href", "rel", "class", "style", "crossorigin", "integrity", "target", "src", "width", "height", "frameborder", "allow", "allowfullscreen", "title", "loading", "referrerpolicy"],
            WHOLE_DOCUMENT: true,
        });
        DOMPurify.removeAllHooks();
        DOMPurify.addHook('afterSanitizeAttributes', function (node) {
            if (node.tagName === 'IFRAME') {
                const src = node.getAttribute('src') || '';
                // YouTubeとGoogle Maps以外は認めない、あるいはsandboxを強制
                const isYouTube = src.includes('youtube.com/') || src.includes('youtube-nocookie.com/');
                const isGoogleMaps = src.includes('google.co.jp/maps') || src.includes('google.com/maps');

                if (!isYouTube && !isGoogleMaps) {
                    node.setAttribute('sandbox', 'allow-scripts');
                }
                // 外部のiframeが親（あなたのサイト）を操作できないよう属性を追加
                node.setAttribute('referrerpolicy', 'no-referrer');
            }
        });

        const parser = new DOMParser();
        const doc = parser.parseFromString(sanitizedRaw, "text/html");

        // 1. セキュリティ & Base設定
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

        const base = doc.createElement("base");
        base.target = "_blank";
        doc.head.append(base);

        // 2. 計測スクリプト：内側のコンテナサイズだけを正確に測る
        const script = doc.createElement("script");
        script.textContent = `
        // script.textContent の中身を以下に差し替え
        (function() {
            const sendHeight = () => {
                const el = document.getElementById('content-inner');
                if (!el) return;

                // 子要素も含めた真の最下部を計算
                // getBoundingClientRect().bottom はビューポート基準なので、
                // ページ全体の高さを取るために body の offsetHeight や scrollHeight と比較
                const body = document.body;
                const html = document.documentElement;

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

            // 初回、ロード時、リサイズ時
            window.addEventListener("load", sendHeight);
            window.addEventListener("resize", sendHeight);
            
            // フォント読み込み完了時に再計算（これで見切れが直るケースが多い）
            if (document.fonts) {
                document.fonts.ready.then(sendHeight);
            }

            if (typeof ResizeObserver !== 'undefined') {
                const observer = new ResizeObserver(() => requestAnimationFrame(sendHeight));
                observer.observe(document.body);
                // コンテンツの中身が変わった際も検知
                observer.observe(document.getElementById('content-inner'));
            }

            // 念のため、初期化から数秒間は定期的に送る（動的な埋め込み対策）
            [500, 1000, 3000].forEach(delay => setTimeout(sendHeight, delay));
        })();
        `;
        // Move script to the end of body to ensure it executes after elements are created
        // Update: Instead of appending to head here, we will append it after body items in doc.body

        // 3. リセットスタイル：途切れを防止しつつ、100vhの連鎖を止める
        const style = doc.createElement("style");
        style.textContent = `
            html, body { 
                margin: 0 !important; 
                padding: 0 !important; 
                width: 100%; 
                height: auto !important;
                min-height: 0 !important;
                overflow: visible !important;
                ${darkMode ? "color: #cbd5e1 !important;" : ""} /* slate-300 */
                font-family: sans-serif;
            }
            a {
                ${darkMode ? "color: #34d399 !important;" : ""} /* emerald-400 */
            }
            #content-inner {
                display: block; /* flow-root よりも確実な場合がある */
                width: 100%;
                height: auto !important;
                /* 上下のマージンが突き抜けて計測不能になるのを防ぐ魔法のプロパティ */
                padding: 1px 0; 
                margin: 0;
                box-sizing: border-box;
            }
            /* 画像やiframeが親を突き破るのを防ぐ */
            img, video, iframe {
                max-width: 100%;
            }
        `;
        doc.head.append(style);

        // 4. ボディ全体を計測用divで包む
        const innerWrapper = doc.createElement("div");
        innerWrapper.id = "content-inner";
        while (doc.body.firstChild) {
            innerWrapper.appendChild(doc.body.firstChild);
        }
        doc.body.appendChild(innerWrapper);
        doc.body.appendChild(script); // Append script after innerWrapper

        return doc.documentElement.outerHTML;
    }, [html, iframeId, darkMode]);

    return (
        <div style={{ width: "100%", display: "block", position: "relative" }}>
            <iframe
                srcDoc={srcDoc}
                sandbox="allow-scripts allow-popups allow-forms allow-presentation allow-same-origin"
                scrolling="no"
                style={{
                    width: "100%",
                    minWidth: "100%",
                    height: height,
                    border: "none",
                    backgroundColor: "transparent",
                    display: "block",
                    transition: "none",
                    overflow: "hidden"
                }}
                title="Secure Sandbox"
            />
        </div>
    );
}