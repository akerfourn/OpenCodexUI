import { describe, expect, it } from "vitest";

import {
  LARGE_MARKDOWN_CHARACTER_THRESHOLD,
  LARGE_MARKDOWN_LINE_THRESHOLD,
  MARKDOWN_PREVIEW_CHARACTER_LIMIT,
  MARKDOWN_PREVIEW_LINE_LIMIT,
  createMarkdownContentProfile
} from "../src/components/messages/markdownMessageOptimization";

describe("createMarkdownContentProfile", () => {
  it("should leave content below both limits untouched", () => {
    const markdown = "A short message";

    const profile = createMarkdownContentProfile(markdown);

    expect(profile.isLarge).toBe(false);
    expect(profile.preview.markdown).toBe(markdown);
    expect(profile.preview.isLimited).toBe(false);
    expect(profile.preview.omittedCharacterCount).toBe(0);
  });

  it("should bound a large single-line message by characters", () => {
    const markdown = "x".repeat(LARGE_MARKDOWN_CHARACTER_THRESHOLD + 1);

    const profile = createMarkdownContentProfile(markdown);

    expect(profile.isLarge).toBe(true);
    expect(profile.preview.markdown.length).toBe(MARKDOWN_PREVIEW_CHARACTER_LIMIT);
    expect(profile.preview.omittedCharacterCount).toBe(
      markdown.length - MARKDOWN_PREVIEW_CHARACTER_LIMIT
    );
  });

  it("should bound a large multiline message by complete lines", () => {
    const markdown = Array.from(
      { length: LARGE_MARKDOWN_LINE_THRESHOLD + 1 },
      (_, index) => `line ${index}`
    ).join("\n");

    const profile = createMarkdownContentProfile(markdown);

    expect(profile.isLarge).toBe(true);
    expect(profile.preview.markdown.trimEnd().split(/\r?\n/))
      .toHaveLength(MARKDOWN_PREVIEW_LINE_LIMIT);
    expect(profile.preview.markdown).not.toContain(`line ${LARGE_MARKDOWN_LINE_THRESHOLD}`);
    expect(profile.preview.omittedCharacterCount).toBeGreaterThan(0);
  });

  it("should close a code fence when the preview ends inside it", () => {
    const markdown = [
      "```ts",
      ...Array.from({ length: LARGE_MARKDOWN_LINE_THRESHOLD + 1 }, (_, index) => (
        `const value${index} = ${index};`
      )),
      "```",
      "tail-marker"
    ].join("\n");

    const profile = createMarkdownContentProfile(markdown);

    expect(profile.preview.markdown).toContain("```ts");
    expect(profile.preview.markdown.trimEnd().endsWith("```"))
      .toBe(true);
    expect(profile.preview.markdown).not.toContain("tail-marker");
  });

  it("should not split an emoji at the character preview boundary", () => {
    const markdown = [
      "x".repeat(MARKDOWN_PREVIEW_CHARACTER_LIMIT - 1),
      "😀",
      "tail"
    ].join("");

    const profile = createMarkdownContentProfile(
      `${markdown}${"y".repeat(LARGE_MARKDOWN_CHARACTER_THRESHOLD)}`
    );

    expect(profile.preview.markdown).not.toContain("😀");
    expect(profile.preview.markdown).not.toContain("tail");
  });
});
