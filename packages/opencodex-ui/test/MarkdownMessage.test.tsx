/**
 * Covers stable Markdown structures used by completed and streamed messages.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

import { MarkdownMessage } from "../src/components/messages/MarkdownMessage";

describe("MarkdownMessage", () => {
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

  it("should render an incomplete streamed code fence without failing", () => {
    const markup = renderToStaticMarkup(
      <MarkdownMessage
        markdown={"```ts\nconst partial = true;"}
        isStreaming
        onOpenLink={vi.fn()}
      />
    );

    expect(markup).toContain("<code");
    expect(markup).toContain("partial");
    expect(markup).not.toContain("hljs-keyword");
  });
});
