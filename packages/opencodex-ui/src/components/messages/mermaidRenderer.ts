import type { MermaidConfig } from "mermaid";

export const MAX_MERMAID_SOURCE_LENGTH = 50000;
const MAX_CACHE_CHARACTERS = 2 * 1024 * 1024;
const images = new Map<string, string>();
let cachedCharacters = 0;
let nextId = 0;
let queue: Promise<void> = Promise.resolve();

/** Serializes Mermaid's global configuration and bounds cached SVG images across message remounts. */
export function renderMermaidImage(code: string, mode: "light" | "dark", signal: AbortSignal): Promise<string> {
  if (code.length > MAX_MERMAID_SOURCE_LENGTH) return Promise.reject(new Error("Mermaid source exceeds 50000 characters."));
  const key = `${mode}\0${code}`;
  const cached = images.get(key);
  if (cached !== undefined && !signal.aborted) {
    images.delete(key);
    images.set(key, cached);
    return Promise.resolve(cached);
  }
  const task = queue.then(async () => {
    signal.throwIfAborted();
    const existing = images.get(key);
    if (existing !== undefined) return existing;
    const image = await createImage(code, mode, signal);
    if (image.length <= MAX_CACHE_CHARACTERS) {
      images.set(key, image);
      cachedCharacters += image.length;
      while (images.size > 32 || cachedCharacters > MAX_CACHE_CHARACTERS) {
        const oldest = images.keys().next().value as string;
        cachedCharacters -= images.get(oldest)!.length;
        images.delete(oldest);
      }
    }
    return image;
  });
  queue = task.then(() => undefined, () => undefined);
  return task;
}

/** Loads the maintained Mermaid parser/layout engine only when a visible diagram needs it. */
async function createImage(code: string, mode: "light" | "dark", signal: AbortSignal): Promise<string> {
  const { default: mermaid } = await import("mermaid");
  signal.throwIfAborted();
  const config: MermaidConfig = {
    startOnLoad: false, securityLevel: "strict", htmlLabels: false,
    theme: "dark", fontFamily: "system-ui, sans-serif", maxTextSize: MAX_MERMAID_SOURCE_LENGTH,
    maxEdges: 500, suppressErrorRendering: true,
    // Document directives/frontmatter cannot weaken security, change limits or inject theme CSS.
    secure: [...new Set([...Object.keys(mermaid.mermaidAPI.getConfig()), "secure", "themeCSS", "dompurifyConfig"])],
    flowchart: { htmlLabels: false }
  };
  if (mode === "light") config.theme = "default";
  mermaid.initialize(config);
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-100000px;top:0;width:1200px;visibility:hidden;pointer-events:none";
  host.setAttribute("aria-hidden", "true");
  document.body.append(host);
  try {
    nextId += 1;
    const { svg } = await mermaid.render(`opencodex-mermaid-${nextId}`, code, host);
    signal.throwIfAborted();
    if (svg.length > MAX_CACHE_CHARACTERS) throw new Error("Mermaid image exceeds the preview size limit.");
    return svgImageUrl(svg);
  } finally {
    host.remove();
  }
}

/** Gives the final image explicit natural dimensions without mounting active SVG in the Markdown subtree. */
function svgImageUrl(svg: string): string {
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = document.documentElement;
  if (root.localName !== "svg" || document.querySelector("parsererror") !== null) throw new Error("Invalid Mermaid SVG.");
  const viewBox = root.getAttribute("viewBox")?.trim().split(/[\s,]+/u).map(Number);
  if (viewBox !== undefined && viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2]! > 0 && viewBox[3]! > 0) {
    root.setAttribute("width", String(viewBox[2]));
    root.setAttribute("height", String(viewBox[3]));
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(root))}`;
}
