"use client";
import { useState, useEffect, useId, useMemo } from "react";
import DOMPurify from "isomorphic-dompurify";

export default function ResponsiveSecureFrame({ html }: { html: string }) {
    const [height, setHeight] = useState("400px");
    const iframeId = useId();

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.origin !== "null") return;
            if (event.data && event.data.type === "resize-iframe" && event.data.id === iframeId) {
                const nextHeight = Math.ceil(event.data.height);

                setHeight((prev) => {
                    const currentHeight = parseInt(prev);
                    // 【ループ防止】変化が5px未満なら更新しない（100vhループをここで断つ）
                    if (Math.abs(nextHeight - currentHeight) < 5) return prev;
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
            default-src 'none'; 
            script-src 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://*.ytimg.com https://*.googleapis.com;
            style-src 'unsafe-inline' ${trustedCDNs}; 
            font-src ${trustedCDNs} data:; 
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
            (function() {
                const sendHeight = () => {
                    const el = document.getElementById('content-inner');
                    if (!el) return;
                    // getBoundingClientRect を使って小数点以下の精度で計測
                    const rect = el.getBoundingClientRect();
                    window.parent.postMessage({ 
                        type: "resize-iframe", 
                        id: "${iframeId}", 
                        height: rect.height
                    }, "*");
                };
                window.addEventListener("load", sendHeight);
                if (typeof ResizeObserver !== 'undefined') {
                    // content-inner そのものを監視対象にする
                    const target = document.getElementById('content-inner');
                    if (target) {
                        new ResizeObserver(() => requestAnimationFrame(sendHeight)).observe(target);
                    }
                }
            })();
        `;
        // Move script to the end of body to ensure it executes after elements are created
        // Update: Instead of appending to head here, we will append it after body items in doc.body

        // 3. リセットスタイル：途切れを防止しつつ、100vhの連鎖を止める
        const style = doc.createElement("style");
        style.textContent = `
            html, body { 
                margin: 0; padding: 0; width: 100%; 
                height: auto !important; /* 絶対に auto にして途切れを防止 */
                min-height: 0 !important;
                overflow: hidden; 
            }
            /* 計測用のラッパー */
            #content-inner {
                display: flow-root; /* float解除を自動化 */
                width: 100%;
                height: auto;
            }
            /* 100vh を使っている要素への対策：iframeの高さではなく親の想定サイズに寄せる */
            header[style*="100vh"], section[style*="100vh"] {
                height: 600px !important;
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
    }, [html, iframeId]);

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