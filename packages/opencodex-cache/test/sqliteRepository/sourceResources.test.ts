import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOpenCodexSqliteCacheRepository } from "../../src/SqliteOpenCodexCacheRepository";
import type { OpenCodexCacheRepository } from "../../src/types";
import { parseSourceSettings } from "../../src/sqlite/sources/sourceSettings";

describe("source resource persistence", () => {
  let directory: string;
  let repository: OpenCodexCacheRepository;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "opencodex-source-resources-"));
    repository = createOpenCodexSqliteCacheRepository({ directory });
  });
  afterEach(async () => {
    await repository.close();
    fs.rmSync(directory, { force: true, recursive: true });
  });

  it("should retain policies across database reopen and unrelated source edits", async () => {
    const source = await repository.ensureDefaultSource();
    await repository.updateSource(source.id, { settings: { resources: { priority: "low", cpuLimitPercent: 50 } } });
    await repository.close();
    repository = createOpenCodexSqliteCacheRepository({ directory });
    await repository.updateSource(source.id, { name: "Renamed", settings: { color: "teal" } });
    expect(await repository.getSource(source.id)).toMatchObject({ name: "Renamed", settings: {
      color: "teal", resources: { priority: "low", cpuLimitPercent: 50 }
    } });
    await repository.updateSource(source.id, { settings: { resources: { priority: "normal", cpuLimitPercent: null } } });
    expect((await repository.getSource(source.id))?.settings).toMatchObject({ resources: { priority: "normal", cpuLimitPercent: null } });
  });

  it("should preserve old JSON settings and ignore only a corrupt optional policy", () => {
    const oldSettings = { color: "teal", commandMode: "auto", command: null, openFolderCommand: "code %D", openFileCommand: null };
    expect(parseSourceSettings("local", JSON.stringify(oldSettings))).toEqual(oldSettings);
    expect(parseSourceSettings("local", JSON.stringify({ ...oldSettings, resources: { cpuLimitPercent: -1 } })))
      .toEqual(oldSettings);
  });

  it("should reject invalid writes before changing the existing source", async () => {
    const source = await repository.ensureDefaultSource();
    await expect(repository.updateSource(source.id, { settings: { resources: { priority: "low", cpuLimitPercent: 0 } } }))
      .rejects.toThrow("between 1 and 100");
    expect(await repository.getSource(source.id)).toEqual(source);
  });

  it("should reject nonlocal policies even when a custom source can access local files", async () => {
    await expect(repository.createSource("Remote", { kind: "custom", settings: {
      command: "ssh machine codex", hasLocalAccess: true, resources: { priority: "low", cpuLimitPercent: 50 }
    } })).rejects.toThrow("only for local sources");
  });

  it("should discard the local policy when changing to a custom command", async () => {
    const source = await repository.createSource("Local", { kind: "local", settings: {
      resources: { priority: "low", cpuLimitPercent: 50 }
    } });
    await repository.updateSource(source.id, { settings: { commandMode: "custom", command: "ssh remote codex" } });
    expect(await repository.getSource(source.id)).toMatchObject({ kind: "custom" });
    expect((await repository.getSource(source.id))?.settings).not.toHaveProperty("resources");
  });
});
