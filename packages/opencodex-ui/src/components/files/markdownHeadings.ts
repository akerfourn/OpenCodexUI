interface HeadingNode {
  type: string;
  tagName?: string;
  value?: string;
  children?: HeadingNode[];
  properties?: Record<string, unknown>;
}

/** Extracts plain heading text, including emphasis and inline code. */
function headingText(node: HeadingNode): string {
  if (node.value !== undefined) return node.value;
  return node.children?.map(headingText).join("") ?? "";
}

/** Generates document-local IDs after sanitization for both Markdown and HTML headings. */
export function rehypeFileHeadings() {
  return (tree: HeadingNode): void => {
    const used = new Set<string>();
    /** Assigns unique heading anchors without preserving author-supplied DOM IDs. */
    function visit(node: HeadingNode): void {
      if (node.type === "element" && /^h[1-6]$/.test(node.tagName ?? "")) {
        const base = headingText(node).toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\s-]/gu, "").replace(/\s/g, "-");
        let slug = base;
        let suffix = 0;
        while (used.has(slug)) slug = `${base}-${++suffix}`;
        used.add(slug);
        node.properties = { ...node.properties, id: `file-markdown-${slug}` };
      }
      node.children?.forEach(visit);
    }
    visit(tree);
  };
}
