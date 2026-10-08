/**
 * Builds and caches the expensive unified Markdown render tree.
 */
import { useContext, type ReactElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex, { type Options as RehypeKatexOptions } from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { MarkdownLink } from "./MarkdownLink";
import { InlineCode } from "./InlineCode";
import { PreBlock } from "./PreBlock";
import { getCachedMarkdownRender } from "./markdownRenderCache";
import { remarkCodexDirectives } from "./remarkCodexDirectives";
import { CodexDirectiveSpanX } from "./CodexDirectiveSpan";
import { MarkdownLinkContext } from "./MarkdownLinkContext";
import { transformMarkdownUrl } from "./markdownUrls";
import { ChatImage } from "./ChatImage";

export type MarkdownRenderVariant = "streaming" | "standard" | "highlighted";

export { MarkdownLinkContext, type MarkdownLinkContextValue } from "./MarkdownLinkContext";

const textRemarkPlugins = [remarkGfm, remarkCodexDirectives];
const syntaxRehypePlugins = [rehypeHighlight];
const remarkPlugins = [remarkGfm, remarkMath, remarkCodexDirectives];
const rehypeKatexOptions: RehypeKatexOptions = {
  strict: "ignore",
  trust: false
};
const katexPlugin: [typeof rehypeKatex, RehypeKatexOptions] = [
  rehypeKatex,
  rehypeKatexOptions
];
const mathRehypePlugins = [katexPlugin];
const highlightedRehypePlugins = [katexPlugin, rehypeHighlight];
const plainRehypePlugins: [] = [];

const markdownComponents: Components & { "codex-directive": typeof CodexDirectiveSpanX } = {
  "codex-directive": CodexDirectiveSpanX,
  pre: PreBlock,
  code: InlineCode,
  a: ContextualMarkdownLink,
  img: ChatImage
};

/**
 * Builds a Markdown render tree and reuses completed trees across remounts.
 *
 * `react-markdown`'s synchronous renderer returns an immutable React tree after
 * running unified. Calling it here lets the bounded cache retain that parsed
 * tree while link actions remain resolved through the current React context.
 *
 * @param markdown Markdown source to render.
 * @param variant Rendering pipeline variant.
 * @returns React tree ready to mount.
 */
export function createMarkdownRenderTree(
  markdown: string,
  variant: MarkdownRenderVariant,
  renderMath = true
): ReactElement {
  const createTree = (): ReactElement => ReactMarkdown({
    remarkPlugins: renderMath ? remarkPlugins : textRemarkPlugins,
    rehypePlugins: getRehypePlugins(variant, renderMath),
    components: markdownComponents,
    urlTransform: transformMarkdownUrl,
    children: markdown
  });

  if (variant === "streaming") {
    return createTree();
  }

  return getCachedMarkdownRender(
    [variant, String(renderMath), markdown].join("\u0000"),
    markdown.length,
    createTree
  );
}

/**
 * Resolves the rehype pipeline for one render state.
 *
 * @param variant Rendering pipeline variant.
 * @returns Rehype plugins used by the renderer.
 */
function getRehypePlugins(variant: MarkdownRenderVariant, renderMath: boolean) {
  if (!renderMath) return variant === "highlighted" ? syntaxRehypePlugins : plainRehypePlugins;
  if (variant === "streaming") {
    return plainRehypePlugins;
  }

  return variant === "highlighted"
    ? highlightedRehypePlugins
    : mathRehypePlugins;
}

type ContextualMarkdownLinkProps = {
  href?: string;
  children?: ReactNode;
};

/**
 * Resolves link behavior at mount time instead of capturing it in the cache.
 *
 * @param props Link properties produced by react-markdown.
 * @returns Context-aware Markdown link.
 */
function ContextualMarkdownLink({
  href,
  children
}: ContextualMarkdownLinkProps) {
  const context = useContext(MarkdownLinkContext);

  if (context === null) {
    return <>{children}</>;
  }

  return (
    <MarkdownLink
      href={href}
      requireModifiedClick={context.requireModifiedClick}
      onOpenLink={context.onOpenLink}
    >
      {children}
    </MarkdownLink>
  );
}
