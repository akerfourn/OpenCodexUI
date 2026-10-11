import { defaultSchema, type Options } from "rehype-sanitize";

const protocols = { ...defaultSchema.protocols };
// ReactMarkdown's transformMarkdownUrl validates these URLs, including source-owned
// file paths and image data URLs that the default sanitizer would discard.
delete protocols.href;
delete protocols.src;

/** Allows document formatting while removing active content and arbitrary DOM attributes. */
export const markdownHtmlSchema: Options = {
  ...defaultSchema,
  protocols,
  tagNames: defaultSchema.tagNames?.filter(tag => tag !== "picture" && tag !== "source"),
  strip: ["script", "style", "iframe", "object", "embed", "form", "template", "svg", "math"],
  attributes: {
    "*": ["title", ["align", "left", "center", "right"], ["dir", "ltr", "rtl"]],
    a: ["href"],
    code: [["className", /^language-[\w+-]+$/]],
    img: ["src", "alt", "width", "height"],
    input: [["disabled", true], ["type", "checkbox"], "checked"],
    li: [["className", "task-list-item"]],
    ol: ["start", ["className", "contains-task-list"]],
    ul: [["className", "contains-task-list"]],
    td: ["colSpan", "rowSpan"],
    th: ["colSpan", "rowSpan"],
    details: ["open"]
  }
};
