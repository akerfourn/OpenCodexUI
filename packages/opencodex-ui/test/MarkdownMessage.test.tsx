/**
 * Covers stable Markdown structures used by completed and streamed messages.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

import { MarkdownMessage } from "../src/components/messages/MarkdownMessage";
import { shouldOpenMarkdownLink } from "../src/components/messages/MarkdownLink";

describe("MarkdownMessage", () => {
  it("should require a control or meta click when configured", () => {
    expect(shouldOpenMarkdownLink({ ctrlKey: false, metaKey: false }, true)).toBe(false);
    expect(shouldOpenMarkdownLink({ ctrlKey: true, metaKey: false }, true)).toBe(true);
    expect(shouldOpenMarkdownLink({ ctrlKey: false, metaKey: true }, true)).toBe(true);
    expect(shouldOpenMarkdownLink({ ctrlKey: false, metaKey: false }, false)).toBe(true);
  });

  it("should render completed links, lists, tables and highlighted code", () => {
    const markdown = [
      "- first item",
      "",
      "[OpenAI](https://openai.com)",
      "",
      "| name | value |",
      "| --- | --- |",
      "| answer | 42 |",
      "",
      "```js",
      "const answer = 42;",
      "```"
    ].join("\n");

    const markup = renderToStaticMarkup(
      <MarkdownMessage markdown={markdown} onOpenLink={vi.fn()} />
    );

    expect(markup).toContain("<ul");
    expect(markup).toContain("href=\"https://openai.com\"");
    expect(markup).toContain("<table");
    expect(markup).toContain("hljs-keyword");
  });

  it("should render inline and display math with KaTeX", () => {
    const markdown = [
      "Inline equation: $E = mc^2$.",
      "",
      "$$",
      "\\int_0^1 x^2 dx = \\frac{1}{3}",
      "$$"
    ].join("\n");

    const markup = renderToStaticMarkup(
      <MarkdownMessage markdown={markdown} onOpenLink={vi.fn()} />
    );

    expect(markup).toContain("katex");
    expect(markup).toContain("katex-display");
  });

  it("should render LaTeX-style inline and display delimiters", () => {
    const markdown = [
      "Inline equation: \\(d = v \\times t\\).",
      "",
      "\\[",
      "E = mc^2",
      "\\]"
    ].join("\n");

    const markup = renderToStaticMarkup(
      <MarkdownMessage markdown={markdown} onOpenLink={vi.fn()} />
    );

    expect(markup).toContain("katex");
    expect(markup).toContain("katex-display");
  });

  it("should keep math-like text inside code blocks untouched", () => {
    const markdown = [
      "```js",
      "const formula = '$x^2$ and \\(x^2\\)';",
      "```"
    ].join("\n");

    const markup = renderToStaticMarkup(
      <MarkdownMessage markdown={markdown} onOpenLink={vi.fn()} />
    );

    expect(markup).toContain("language-js");
    expect(markup).toContain("$x^2$");
    expect(markup).toContain("\\(x^2\\)");
    expect(markup).not.toContain('class="katex');
  });

  it("should not fail the whole message when a formula is invalid", () => {
    const markup = renderToStaticMarkup(
      <MarkdownMessage
        markdown="Invalid equation: $\\frac{1}{2$"
        onOpenLink={vi.fn()}
      />
    );

    expect(markup).toContain("katex-error");
  });

  it("should render an incomplete streamed code fence without failing", () => {
    const markup = renderToStaticMarkup(
      <MarkdownMessage
        markdown={"```ts\nconst partial = true;"}
        isStreaming
        onOpenLink={vi.fn()}
      />
    );

    expect(markup).toContain("<pre");
    expect(markup).toContain("<code");
    expect(markup).toContain("partial");
    expect(markup).not.toContain("hljs-keyword");
  });

  it("should leave streamed math unrendered until the message is complete", () => {
    const markup = renderToStaticMarkup(
      <MarkdownMessage
        markdown="Still receiving: $E = mc^2$"
        isStreaming
        onOpenLink={vi.fn()}
      />
    );

    expect(markup).toContain("E = mc^2");
    expect(markup).not.toContain('class="katex');
  });
});
