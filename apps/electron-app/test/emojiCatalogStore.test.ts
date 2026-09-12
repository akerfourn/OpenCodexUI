import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  EmojiCatalogStore,
  normalizeOverrides
} from "../src/main/emojiCatalogStore.js";

describe("EmojiCatalogStore", () => {
  it("should persist only normalized user overrides and reload them", async () => {
    const userDataPath = await mkdtemp(path.join(os.tmpdir(), "opencodexui-emoji-"));
    const store = new EmojiCatalogStore(userDataPath);

    try {
      const saved = await store.update({
        schemaVersion: 1,
        overrides: {
          "😅": {
            addedAliases: [" xD ", "", "xD"],
            removedDefaultAliases: ["gêne"]
          }
        }
      });

      expect(saved).toEqual({
        schemaVersion: 1,
        overrides: {
          "😅": {
            addedAliases: ["xD"],
            removedDefaultAliases: ["gêne"]
          }
        }
      });
      expect(JSON.parse(await readFile(path.join(userDataPath, "emoji-overrides.json"), "utf8")))
        .toEqual(saved);

      const reloaded = await new EmojiCatalogStore(userDataPath).get();
      expect(reloaded).toEqual(saved);
    } finally {
      await rm(userDataPath, { recursive: true, force: true });
    }
  });

  it("should fall back to an empty snapshot for an unsupported schema", () => {
    expect(normalizeOverrides({ schemaVersion: 2, overrides: {} })).toEqual({
      schemaVersion: 1,
      overrides: {}
    });
  });
});
