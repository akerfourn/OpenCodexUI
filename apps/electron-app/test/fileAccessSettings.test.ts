import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { SettingsStore, defaultSettings } from "../src/main/settingsStore.js";

describe("persisted file link permissions", () => {
  it("should restore workspace grants from JSON without retaining malformed permissions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "file-grants-settings-"));
    const grant = { sourceId: "source", projectId: "project", workspaceId: "workspace",
      workspacePath: "/project", destination: "/data", access: "readOnly" as const };
    try {
      const store = new SettingsStore(directory);
      await store.save({ ...defaultSettings, fileLinkGrants: [grant] });
      expect((await new SettingsStore(directory).load()).fileLinkGrants).toEqual([grant]);
      await writeFile(join(directory, "settings.json"), JSON.stringify({ fileLinkGrants: [
        grant, { ...grant, access: "anything" }, { destination: "/private", access: "readWrite" }, null
      ] }));
      expect((await store.load()).fileLinkGrants).toEqual([grant]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
