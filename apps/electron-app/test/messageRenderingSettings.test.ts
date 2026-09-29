import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SettingsStore } from "../src/main/settingsStore.js";

describe("message rendering settings", () => {
  let directory: string;
  beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), "message-rendering-settings-")); });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

  it("should apply role defaults to old settings without discarding unrelated preferences", async () => {
    await writeFile(join(directory, "settings.json"), JSON.stringify({ language: "fr", colorScheme: "dark" }));
    expect(await new SettingsStore(directory).load()).toMatchObject({ language: "fr", colorScheme: "dark",
      messageRendering: { user: { markdown: true, math: false }, assistant: { markdown: true, math: true } } });
  });

  it("should preserve explicit false and true values after saving and recreating the settings store", async () => {
    const store = new SettingsStore(directory);
    const settings = await store.load();
    const messageRendering = { user: { markdown: false, math: true }, assistant: { markdown: true, math: false } };
    await store.save({ ...settings, messageRendering });
    expect((await new SettingsStore(directory).load()).messageRendering).toEqual(messageRendering);
  });
});
