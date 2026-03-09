"use client";
import { useEffect, useRef } from "react";
import DOMPurify from "isomorphic-dompurify";

// Register iframe domain whitelist hook once (client-side only)
let hookAdded = false;

interface SandboxedHtmlProps {
    html: string;
}

/**
 * Renders arbitrary HTML inside a Shadow DOM root so that
 * any <style> tags inside are fully scoped and cannot affect
 * the parent page's styles, and the parent's styles don't bleed in.
 *
 * This is simpler and more reliable than an <iframe srcdoc> approach
 * because there is no height calculation needed.
 */
export default function SandboxedHtml({ html }: SandboxedHtmlProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Only runs on client
        if (!hookAdded) {
            hookAdded = true;
            DOMPurify.addHook("uponSanitizeElement", (node: any, data: any) => {
                if (data.tagName === "iframe") {
                    const src = node.getAttribute("src") || "";
                    if (
                        !src.startsWith("https://www.youtube.com/") &&
                        !src.startsWith("https://www.google.com/maps/") &&
                        !src.startsWith("https://maps.google.com/")
                    ) {
                        node.parentNode?.removeChild(node);
                    }
                }
            });
        }

        const container = containerRef.current;
        if (!container) return;

        const cleanHtml = DOMPurify.sanitize(html, {
            ADD_TAGS: ["iframe", "style"],
            ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "scrolling"],
            FORCE_BODY: true,
        });

        // Attach a shadow root (reuse existing if already attached)
        const shadow =
            (container.shadowRoot as ShadowRoot | null) ??
            container.attachShadow({ mode: "open" });

        shadow.innerHTML = `
<style>
  :host { display: block; }
  img { max-width: 100%; height: auto; }
  iframe { max-width: 100%; aspect-ratio: 16 / 9; width: 100%; }
</style>
${cleanHtml}`;
    }, [html]);

    return <div ref={containerRef} />;
}
