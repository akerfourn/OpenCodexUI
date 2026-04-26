import ReactMarkdown from "react-markdown";
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
        code: CodeBlock
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}

type CodeBlockProps = {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
};

function CodeBlock({ inline, className, children }: CodeBlockProps) {
  const code = String(children ?? "").replace(/\n$/, "");
  const match = /language-(\w+)/.exec(className ?? "");
  const language = match?.[1] ?? "";

  async function handleCopy(): Promise<void> {
    await navigator.clipboard.writeText(code);
  }

  if (inline === true) {
    return <code className={className}>{children}</code>;
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
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}
