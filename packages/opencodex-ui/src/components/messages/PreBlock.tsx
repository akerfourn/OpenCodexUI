import { Box } from "@mui/material";
import { Children, isValidElement, useContext, type ReactNode } from "react";

import { MarkdownCodeBlock } from "./MarkdownCodeBlock";
import { MarkdownDiagramContext } from "./MarkdownDiagramContext";
import { MermaidDiagram } from "./MermaidDiagram";

/** Selects diagram rendering only for explicitly marked, completed Mermaid fences. */
export function PreBlock({ children }: { children?: ReactNode }) {
  const renderDiagrams = useContext(MarkdownDiagramContext);
  const child = Children.toArray(children)[0];
  if (!isValidElement(child)) return <Box component="pre">{children}</Box>;

  const className = String(child.props.className ?? "");
  const code = extractText(child.props.children).replace(/^\n/, "").replace(/\n$/, "");
  const language = /language-([\w+-]+)/u.exec(className)?.[1] ?? "";
  if (language.toLowerCase() === "mermaid" && renderDiagrams) return <MermaidDiagram code={code} />;

  return <MarkdownCodeBlock code={code} language={language} className={className}>
    {child.props.children}
  </MarkdownCodeBlock>;
}

/** Extracts copyable text from syntax-highlighted spans without parsing HTML. */
function extractText(value: ReactNode): string {
  if (value === null || value === undefined || typeof value === "boolean") return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(extractText).join("");
  if (isValidElement(value)) return extractText(value.props.children);
  return "";
}
