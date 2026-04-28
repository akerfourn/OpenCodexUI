import { Box } from "@mui/material";
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

import { InlineCode } from "./InlineCode";
import { MarkdownLink } from "./MarkdownLink";
import { PreBlock } from "./PreBlock";

type MarkdownMessageProps = {
  markdown: string;
  onOpenLink(href: string): void;
};

export function MarkdownMessage({ markdown, onOpenLink }: MarkdownMessageProps) {
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
          code: InlineCode,
          a: ({ href, children }) => (
            <MarkdownLink href={href} onOpenLink={onOpenLink}>
              {children}
            </MarkdownLink>
          )
        }}
      >
        {markdown}
      </ReactMarkdown>
    </Box>
  );
}

export const MarkdownMessageM = memo(MarkdownMessage);
