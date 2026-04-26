import ReactMarkdown from "react-markdown";
import { Children, isValidElement, type ReactNode } from "react";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

type MarkdownMessageProps = {
  markdown: string;
};

export function MarkdownMessage({ markdown }: MarkdownMessageProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        pre: PreBlock,
        code: CodeBlock
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}

type CodeBlockProps = {
  className?: string;
  children?: React.ReactNode;
};

function CodeBlock({ className, children }: CodeBlockProps) {
  return <code className={`inline-code ${className ?? ""}`.trim()}>{children}</code>;
}

type PreBlockProps = {
  children?: ReactNode;
};

function PreBlock({ children }: PreBlockProps) {
  const child = Children.toArray(children)[0];

  if (!isValidElement(child)) {
    return <pre>{children}</pre>;
  }

  const codeClassName = String(child.props.className ?? "");
  const code = String(child.props.children ?? "").replace(/\n$/, "");
  const match = /language-(\w+)/.exec(codeClassName);
  const language = match?.[1] ?? "";

  async function handleCopy(): Promise<void> {
    await navigator.clipboard.writeText(code);
  }

  return (
    <div className="code-block">
      <div className="code-toolbar">
        <span>{language}</span>
        <button
          className="icon-button code-copy-button"
          type="button"
          aria-label="Copier le bloc de code"
          title="Copier le bloc de code"
          onClick={handleCopy}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
      </div>
      <pre>
        <code className={codeClassName}>{code}</code>
      </pre>
    </div>
  );
}
