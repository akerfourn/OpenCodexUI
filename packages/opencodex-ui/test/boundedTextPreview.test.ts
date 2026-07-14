/**
 * Covers bounded previews for very large terminal and diff details.
 */
import { describe, expect, it } from "vitest";

import { createBoundedTextPreview } from "../src/components/messages/boundedTextPreview";

describe("bounded text preview", () => {
  it("should preserve a short value without marking it as limited", () => {
    const preview = createBoundedTextPreview("first\nsecond", {
      strategy: "tail",
      maxLines: 3,
      maxCharacters: 100
    });

    expect(preview).toEqual({
      leadingText: "first\nsecond",
      trailingText: "",
      omittedCharacterCount: 0,
      isLimited: false
    });
  });

  it("should prioritize the latest terminal lines", () => {
    const preview = createBoundedTextPreview("one\ntwo\nthree\nfour", {
      strategy: "tail",
      maxLines: 2,
      maxCharacters: 100
    });

    expect(preview.leadingText).toBe("");
    expect(preview.trailingText).toBe("three\nfour");
    expect(preview.omittedCharacterCount).toBe("one\ntwo\n".length);
    expect(preview.isLimited).toBe(true);
  });

  it("should preserve both ends of a large diff", () => {
    const preview = createBoundedTextPreview("header\nhunk-a\nhunk-b\nhunk-c\nfooter", {
      strategy: "head-tail",
      maxLines: 2,
      maxCharacters: 100
    });

    expect(preview.leadingText).toBe("header\n");
    expect(preview.trailingText).toBe("footer");
    expect(preview.omittedCharacterCount).toBe("hunk-a\nhunk-b\nhunk-c\n".length);
  });

  it("should bound one continuous line by character count", () => {
    const preview = createBoundedTextPreview("abcdefghijklmnopqrstuvwxyz", {
      strategy: "tail",
      maxLines: 5,
      maxCharacters: 8
    });

    expect(preview.trailingText).toBe("stuvwxyz");
    expect(preview.omittedCharacterCount).toBe(18);
  });

  it("should treat CRLF as one line break", () => {
    const preview = createBoundedTextPreview("one\r\ntwo\r\nthree", {
      strategy: "tail",
      maxLines: 2,
      maxCharacters: 100
    });

    expect(preview.trailingText).toBe("two\r\nthree");
  });

  it("should not expose half of a surrogate pair", () => {
    const preview = createBoundedTextPreview("before🙂after", {
      strategy: "tail",
      maxLines: 2,
      maxCharacters: 6
    });

    expect(preview.trailingText).toBe("after");
    expect(preview.trailingText).not.toContain("�");
  });

  it("should keep a deterministic multi-thousand-line output bounded", () => {
    const value = Array.from(
      { length: 10_000 },
      (_, index) => `line-${index.toString().padStart(5, "0")}`
    ).join("\n");

    const preview = createBoundedTextPreview(value, { strategy: "tail" });

    expect(preview.isLimited).toBe(true);
    expect(preview.trailingText.split("\n")).toHaveLength(300);
    expect(preview.trailingText).toContain("line-09999");
    expect(preview.trailingText.length).toBeLessThanOrEqual(64 * 1024);
  });
});
