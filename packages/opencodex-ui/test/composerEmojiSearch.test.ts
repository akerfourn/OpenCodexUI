import { describe, expect, it } from "vitest";

import { searchComposerEmojis } from "../src/components/chat/composerEmojiSearch";
import { getComposerEmojiAliases } from "../src/components/chat/composerEmojis";

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

  it("should include a user alias without removing built-in aliases", () => {
    const overrides = {
      schemaVersion: 1 as const,
      overrides: {
        "😅": {
          addedAliases: ["rire jaune"],
          removedDefaultAliases: []
        }
      }
    };

    expect(searchComposerEmojis("rire jaune", overrides)[0]).toBe("😅");
    expect(getComposerEmojiAliases("😅", overrides)).toContain("rire nerveux");
  });

  it("should hide only the built-in alias selected by the user", () => {
    const overrides = {
      schemaVersion: 1 as const,
      overrides: {
        "😅": {
          addedAliases: [],
          removedDefaultAliases: ["gêne"]
        }
      }
    };

    expect(getComposerEmojiAliases("😅", overrides)).not.toContain("gêne");
    expect(getComposerEmojiAliases("😅", overrides)).toContain("rire nerveux");
  });
});
