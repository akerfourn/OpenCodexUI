/**
 * Covers stable Markdown structures used by completed and streamed messages.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { href?: string }) =>
      key === "message.linkTooltip"
        ? `${options?.href ?? ""} (Ctrl+clic)`
        : key
  })
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

  it("should show the link target and modified-click hint on hover", () => {
    const markup = renderToStaticMarkup(
      <MarkdownMessage
        markdown="[OpenAI](https://openai.com/docs)"
        requireModifiedClick
        onOpenLink={vi.fn()}
      />
    );

    expect(markup).toContain('title="https://openai.com/docs (Ctrl+clic)"');
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

  it("should render only a bounded preview for a large completed message", () => {
    const markdown = [
      "# Large message",
      "",
      "```js",
      ...Array.from({ length: 320 }, (_, index) => `const item${index} = ${index};`),
      "```",
      "tail-marker"
    ].join("\n");

    const markup = renderToStaticMarkup(
      <MarkdownMessage markdown={markdown} onOpenLink={vi.fn()} />
    );

    expect(markup).toContain("Large message");
    expect(markup).not.toContain("tail-marker");
    expect(markup).toContain("message.contentOmitted");
    expect(markup).toContain("message.showAllContent");
    expect(markup).toContain("message.showPlainText");
    expect(markup).not.toContain("hljs-keyword");
  });
});


describe("message rendering preferences", () => {
  it("should leave CLI dollars readable without disabling ordinary Markdown", () => {
    const markdown = "**Terminal**\n\nuser@host:/project$ echo $PATH\nuser@host:/project$ pwd";
    const markup = renderToStaticMarkup(<MarkdownMessage markdown={markdown} renderMath={false} onOpenLink={vi.fn()} />);
    expect(markup).toContain("<strong>Terminal</strong>");
    expect(markup).toContain("user@host:/project$ echo $PATH");
    expect(markup).not.toContain("katex");
    expect(markup).not.toContain("math-inline");
  });

  it("should keep cached trees isolated when math is toggled on, off and on", () => {
    const markdown = String.raw`Inline $x^2$, \(y^2\) and block:

$$
z^2
$$

\[a^2\]
`;
    const render = (renderMath: boolean) => renderToStaticMarkup(
      <MarkdownMessage markdown={markdown} renderMath={renderMath} onOpenLink={vi.fn()} />
    );
    expect(render(true)).toContain('class="katex');
    const plainMath = render(false);
    expect(plainMath).not.toContain("katex");
    expect(plainMath).toContain("$x^2$");
    expect(plainMath).toContain("$$");
    expect(render(true)).toContain('class="katex');
  });

  it("should show original source including delimiters when Markdown is disabled", () => {
    const markdown = String.raw`# Title
**bold** and $x^2$ and \(y^2\)`;
    const markup = renderToStaticMarkup(
      <MarkdownMessage markdown={markdown} renderMarkdown={false} renderMath onOpenLink={vi.fn()} />
    );
    expect(markup).toContain(markdown);
    expect(markup).toContain("markdown-message-plain");
    expect(markup).not.toContain("<strong>");
    expect(markup).not.toContain("katex");
  });

  it("should bypass math parsing during streaming and for explicit math code fences", () => {
    for (const isStreaming of [true, false]) {
      const markup = renderToStaticMarkup(<MarkdownMessage
        markdown={"$PATH$\n\n```math\nx^2\n```"} renderMath={false} isStreaming={isStreaming} onOpenLink={vi.fn()} />);
      expect(markup).toContain("$PATH$");
      expect(markup).not.toContain("katex");
      expect(markup).not.toContain("math-inline");
    }
  });
});
