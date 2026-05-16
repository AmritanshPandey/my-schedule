"use client";

import { useEffect, useRef, useState } from "react";
import { detectResponsiveHtml } from "@/lib/strategy/detectResponsiveHtml";
import { sanitizeStrategyHtml } from "@/lib/strategy/sanitizeStrategyHtml";
import { injectResponsiveStyles } from "@/lib/strategy/injectResponsiveStyles";

interface StrategyHtmlRendererProps {
  htmlContent: string;
  renderMode: "original" | "adaptive";
  onModeDetected?: (mode: "original" | "adaptive") => void;
}

export default function StrategyHtmlRenderer({
  htmlContent,
  renderMode,
  onModeDetected,
}: StrategyHtmlRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [srcdoc, setSrcdoc] = useState("");

  useEffect(() => {
    const sanitized = sanitizeStrategyHtml(htmlContent);
    const isResponsive = detectResponsiveHtml(sanitized);

    const effectiveMode = renderMode === "adaptive" ? "adaptive"
      : isResponsive ? "original"
      : "adaptive"; // auto-switch non-responsive to adaptive

    onModeDetected?.(effectiveMode);

    const processed =
      effectiveMode === "adaptive" ? injectResponsiveStyles(sanitized) : sanitized;

    // Inject a base meta viewport if missing (always needed for the iframe)
    const hasViewport = /<meta[^>]*name\s*=\s*["']viewport["']/i.test(processed);
    const final = hasViewport
      ? processed
      : processed.replace(
          /<head[^>]*>/i,
          (match) => `${match}<meta name="viewport" content="width=device-width,initial-scale=1">`,
        ) || `<meta name="viewport" content="width=device-width,initial-scale=1">${processed}`;

    setSrcdoc(final);
  }, [htmlContent, renderMode]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcdoc}
      sandbox="allow-same-origin"
      className="w-full h-full border-0 bg-white"
      title="Strategy Content"
    />
  );
}
