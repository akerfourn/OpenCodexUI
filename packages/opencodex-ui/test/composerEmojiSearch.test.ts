import { describe, expect, it } from "vitest";

import { searchComposerEmojis } from "../src/components/chat/composerEmojiSearch";

describe("composer emoji search", () => {
  it("should match several French terms for one emotional emoji", () => {
    const results = searchComposerEmojis("rire nerveux");

    expect(results).toContain("😅");
  });

  it("should ignore accents when searching aliases", () => {
    const results = searchComposerEmojis("gene");

    expect(results).toContain("😅");
    expect(results).toContain("😳");
  });

  it("should support English aliases for a French chat catalogue", () => {
    const results = searchComposerEmojis("thinking");

    expect(results[0]).toBe("🤔");
  });

  it("should return an empty result for an unknown query", () => {
    expect(searchComposerEmojis("terme-inexistant")).toEqual([]);
  });
});

