interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  data?: { hProperties?: Record<string, unknown> };
}

/** Extracts plain heading text, including emphasis and inline code. */
function headingText(node: MarkdownNode): string {
  if (node.value !== undefined) return node.value;
  return node.children?.map(headingText).join("") ?? "";
}

/** Produces document-local heading IDs while keeping repeated headings addressable. */
export function remarkFileHeadings() {
  return (tree: MarkdownNode): void => {
    const used = new Set<string>();
    /** Visits headings without rewriting document content or enabling raw HTML. */
    function visit(node: MarkdownNode): void {
      if (node.type === "heading") {
        const base = headingText(node).toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\s-]/gu, "").replace(/\s/g, "-");
        let slug = base;
        let suffix = 0;
        while (used.has(slug)) slug = `${base}-${++suffix}`;
        used.add(slug);
        node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id: `file-markdown-${slug}` } };
      }
      node.children?.forEach(visit);
    }
    visit(tree);
  };
}
