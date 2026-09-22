import type { Root, RootContent, Text } from "mdast";
import { parseCodexDirectives } from "./codexDirectives";

/** Replaces complete text hints only; code, links and unknown directives stay unchanged. */
export function remarkCodexDirectives() {
  return (tree: Root, file: { value: unknown }): void => {
    visit(tree, String(file.value));
  };
}

/** Visits phrasing text without touching literal code or existing interactive links. */
function visit(node: Root | RootContent, source: string): void {
  if (node.type === "link" || node.type === "linkReference" || !("children" in node)) return;
  const children: RootContent[] = [];
  for (const child of node.children) {
    if (child.type !== "text") {
      visit(child, source);
      children.push(child);
      continue;
    }
    const original = source.slice(child.position?.start.offset, child.position?.end.offset);
    if (original.includes("\\:codex-")) {
      children.push(child);
      continue;
    }
    let offset = 0;
    for (const directive of parseCodexDirectives(child.value)) {
      if (directive.start > offset) children.push({ type: "text", value: child.value.slice(offset, directive.start) });
      children.push({ type: "text", value: directive.label, data: {
        hName: "codex-directive",
        hProperties: { "data-codex-kind": directive.kind, "data-codex-value": directive.value },
        hChildren: [{ type: "text", value: directive.label }]
      } } as Text);
      offset = directive.end;
    }
    if (offset === 0) children.push(child);
    else if (offset < child.value.length) children.push({ type: "text", value: child.value.slice(offset) });
  }
  // Node types restrict children differently; the replacement preserves phrasing structure.
  node.children = children as typeof node.children;
}
