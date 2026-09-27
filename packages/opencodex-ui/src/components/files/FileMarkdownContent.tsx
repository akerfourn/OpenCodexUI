import { Alert, Box } from "@mui/material";
import { memo } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useTranslation } from "react-i18next";
import { PreBlock } from "../messages/PreBlock";
import { InlineCode } from "../messages/InlineCode";
import { MarkdownPreviewImage } from "./MarkdownPreviewImage";
import { remarkFileHeadings } from "./markdownHeadings";

const remarkPlugins = [remarkGfm, remarkFileHeadings];
const rehypePlugins = [rehypeHighlight];
const components = { pre: PreBlock, code: InlineCode, img: MarkdownPreviewImage };
export const MAX_MARKDOWN_PREVIEW_LENGTH = 100_000;

/** Local file URLs are handled by the source-aware click handler, never loaded by the browser. */
function transformDocumentUrl(url: string): string {
  if (/^file:/i.test(url)) return url;
  return defaultUrlTransform(url);
}

/** Renders ordinary Markdown without chat directives or executable HTML. */
export function FileMarkdownContent({ content }: { content: string }) {
  const { t } = useTranslation();
  if (content.length > MAX_MARKDOWN_PREVIEW_LENGTH || content.split("\n").length > 5000) {
    return <Alert severity="info">{t("files.previewTooLarge")}</Alert>;
  }
  return (
    <Box className="markdown-message files-markdown-content" sx={{
      maxWidth: 960, mx: "auto", lineHeight: 1.6, overflowWrap: "anywhere",
      "& a": { color: "primary.main" },
      "& img": { maxWidth: "100%" },
      "& blockquote": { ml: 0, pl: 2, borderLeft: "3px solid", borderColor: "divider", color: "text.secondary" },
      "& table": { display: "block", overflowX: "auto", borderCollapse: "collapse" },
      "& th, & td": { border: "1px solid", borderColor: "divider", px: 1.5, py: 0.75, textAlign: "left" },
      "& th": { bgcolor: "action.hover" },
      "& > :first-of-type": { mt: 0 },
      "& pre": { overflowX: "auto" }
    }}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}
        urlTransform={transformDocumentUrl} skipHtml>
        {content}
      </ReactMarkdown>
    </Box>
  );
}
export const FileMarkdownContentM = memo(FileMarkdownContent);
