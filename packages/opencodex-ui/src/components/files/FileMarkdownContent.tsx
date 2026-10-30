import { Alert, Box } from "@mui/material";
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { type Options } from "rehype-sanitize";
import { useTranslation } from "react-i18next";
import { PreBlock } from "../messages/PreBlock";
import { InlineCode } from "../messages/InlineCode";
import { MarkdownPreviewImage } from "./MarkdownPreviewImage";
import { rehypeFileHeadings } from "./markdownHeadings";
import { markdownHtmlSchema } from "./markdownHtmlSafety";

import { splitMarkdownFrontmatter } from "./splitMarkdownFrontmatter";
import { MarkdownFrontmatter } from "./MarkdownFrontmatter";
import { markdownHeadingStyles } from "../messages/markdownHeadingStyles";
import { transformMarkdownUrl } from "../messages/markdownUrls";

const remarkPlugins = [remarkGfm];
const sanitizePlugin: [typeof rehypeSanitize, Options] = [rehypeSanitize, markdownHtmlSchema];
const highlightPlugin: [typeof rehypeHighlight, { plainText: string[] }] = [rehypeHighlight, { plainText: ["mermaid"] }];
const rehypePlugins = [rehypeRaw, sanitizePlugin, rehypeFileHeadings, highlightPlugin];
const components = { pre: PreBlock, code: InlineCode, img: MarkdownPreviewImage };
export const MAX_MARKDOWN_PREVIEW_LENGTH = 100_000;

/** Renders document Markdown and filtered HTML without chat directives or active content. */
export function FileMarkdownContent({ content }: { content: string }) {
  const { t } = useTranslation();
  if (content.length > MAX_MARKDOWN_PREVIEW_LENGTH || content.split("\n").length > 5000) {
    return <Alert severity="info">{t("files.previewTooLarge")}</Alert>;
  }
  const { yaml, markdown } = splitMarkdownFrontmatter(content);
  let metadata;
  if (yaml !== null) metadata = <MarkdownFrontmatter yaml={yaml} />;
  return (
    <Box className="markdown-message files-markdown-content" sx={{
      ...markdownHeadingStyles,
      maxWidth: 960, mx: "auto", lineHeight: 1.6, overflowWrap: "anywhere",
      "& a": { color: "primary.main" },
      "& img": { maxWidth: "100%" },
      "& blockquote": { ml: 0, pl: 2, borderLeft: "3px solid", borderColor: "divider", color: "text.secondary" },
      "& table": { display: "block", overflowX: "auto", borderCollapse: "collapse" },
      "& th, & td": { border: "1px solid", borderColor: "divider", px: 1.5, py: 0.75, textAlign: "left" },
      "& th": { bgcolor: "action.hover" },
      "& [align=left]": { textAlign: "left" },
      "& [align=center]": { textAlign: "center" },
      "& [align=right]": { textAlign: "right" },
      "& > :first-of-type": { mt: 0 },
      "& pre": { overflowX: "auto" }
    }}>
      {metadata}
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}
        urlTransform={transformMarkdownUrl}>
        {markdown}
      </ReactMarkdown>
    </Box>
  );
}
export const FileMarkdownContentM = memo(FileMarkdownContent);
