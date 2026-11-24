const contentSecurityPolicy = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "base-uri 'none'",
  "form-action 'none'"
].join("; ");

const visualizationStyles = `
  :root {
    --background: light-dark(#ffffff, #0d1117);
    --foreground: light-dark(#1f2328, #e6edf3);
    --card: light-dark(#f6f8fa, #161b22);
    --card-foreground: var(--foreground);
    --muted: light-dark(#eaeef2, #21262d);
    --muted-foreground: light-dark(#57606a, #8b949e);
    --border: light-dark(#d8dee4, #30363d);
    --primary: light-dark(#0969da, #58a6ff);
    --primary-foreground: light-dark(#ffffff, #08111f);
    --font-size-base: 14px;
    --viz-series-1: var(--primary);
    --viz-series-2: light-dark(#1a7f37, #3fb950);
    --viz-series-3: light-dark(#9a6700, #d29922);
    --viz-series-4: light-dark(#8250df, #a371f7);
    --viz-series-5: light-dark(#cf222e, #f85149);
    --viz-series-6: light-dark(#bc4c00, #db6d28);
    font: var(--font-size-base)/1.45 system-ui, sans-serif;
    color: var(--foreground);
  }
  body { margin: 0; }
  #opencodex-visualization-content { display: flow-root; overflow-wrap: anywhere; }
  .text-small { font-size: 0.875em; }
  .text-muted { color: var(--muted-foreground); }
  .tabular-nums { font-variant-numeric: tabular-nums; }
  .viz-dotted-background {
    background-image: radial-gradient(var(--border) 1px, transparent 1px);
    background-size: 12px 12px;
  }
`;

const reportSize = `(() => {
  const content = document.getElementById("opencodex-visualization-content");
  if (content === null) return;
  const reportHeight = () => {
    parent.postMessage({ type: "opencodex.visualizationHeight", height: content.offsetHeight }, "*");
  };
  new ResizeObserver(reportHeight).observe(content);
  reportHeight();
})();`;

/** Wraps self-contained HTML for an opaque iframe with inline scripts and data assets only. */
export function createVisualizationDocument(fragment: string, mode: "light" | "dark"): string {
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="${mode}">
<style>${visualizationStyles}</style>
</head><body>
<div id="opencodex-visualization-content">${fragment}</div>
<script>${reportSize}</script>
</body></html>`;
}
