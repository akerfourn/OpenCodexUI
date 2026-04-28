import { Box, IconButton, Paper, Tooltip, Typography } from "@mui/material";
import { memo, Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

type MarkdownMessageProps = {
  markdown: string;
};

function MarkdownMessageBase({ markdown }: MarkdownMessageProps) {
  return (
    <Box
      sx={{
        minWidth: 0,
        lineHeight: 1.45,
        "& > :first-of-type": {
          mt: 0
        },
        "& > :last-child": {
          mb: 0
        },
        "& p": {
          my: 0.5
        },
        "& ul, & ol": {
          my: 0.5,
          pl: 2.5
        },
        "& li + li": {
          mt: 0.25
        },
        "& blockquote": {
          my: 0.75,
          pl: 1.5,
          borderLeft: "3px solid",
          borderColor: "divider",
          color: "text.secondary"
        },
        "& hr": {
          my: 1
        },
        "& h1, & h2, & h3, & h4, & h5, & h6": {
          mt: 1,
          mb: 0.5
        }
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: PreBlock,
          code: InlineCode
        }}
      >
        {markdown}
      </ReactMarkdown>
    </Box>
  );
}

export const MarkdownMessage = memo(MarkdownMessageBase);

type InlineCodeProps = {
  className?: string;
  children?: React.ReactNode;
};

function InlineCode({ className, children }: InlineCodeProps) {
  return (
    <Box
      component="code"
      className={className}
      sx={{
        px: 0,
        py: 0,
        border: 0,
        borderRadius: 0,
        color: "#0f172a",
        bgcolor: "transparent",
        fontFamily:
          'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace',
        fontSize: "0.94em",
        whiteSpace: "break-spaces"
      }}
    >
      {children}
    </Box>
  );
}

type PreBlockProps = {
  children?: ReactNode;
};

function PreBlock({ children }: PreBlockProps) {
  const child = Children.toArray(children)[0];

  if (!isValidElement(child)) {
    return <Box component="pre">{children}</Box>;
  }

  const codeClassName = String(child.props.className ?? "");
  const code = String(child.props.children ?? "").replace(/\n$/, "");
  const match = /language-(\w+)/.exec(codeClassName);
  const language = match?.[1] ?? "";

  async function handleCopy(): Promise<void> {
    await navigator.clipboard.writeText(code);
  }

  return (
    <Paper
      component="section"
      elevation={0}
      sx={{
        maxWidth: "100%",
        overflow: "hidden",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1.5,
        bgcolor: "grey.100"
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
          px: 1,
          py: 0.75,
          color: "text.secondary",
          fontSize: 12
        }}
      >
        <Typography variant="caption" component="span">
          {language}
        </Typography>
        <Tooltip title="Copier le bloc de code">
          <IconButton
            size="small"
            aria-label="Copier le bloc de code"
            onClick={handleCopy}
          >
            <CopyIcon />
          </IconButton>
        </Tooltip>
      </Box>
      <Box
        component="pre"
        sx={{
          m: 0,
          maxWidth: "100%",
          overflowX: "auto",
          overflowY: "hidden",
          p: 1.5
        }}
      >
        <Box
          component="code"
          className={codeClassName}
          sx={{
            fontFamily:
              'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace',
            fontSize: 14,
            whiteSpace: "pre"
          }}
        >
          {code}
        </Box>
      </Box>
    </Paper>
  );
}

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
