/**
 * Covers SQLite source configuration and source association persistence.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOpenCodexSqliteCacheRepository } from "../../src/SqliteOpenCodexCacheRepository";
import type { OpenCodexCacheRepository } from "../../src/types";

describe("source persistence", () => {
  let directory: string;
  let repository: OpenCodexCacheRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "opencodex-cache-"));
    repository = createOpenCodexSqliteCacheRepository({ directory });
  });

  afterEach(async () => {
    await repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("should persist model catalogs per source", async () => {
    const source = await repository.ensureDefaultSource();

    await repository.saveModelCatalog(
      source.id,
      JSON.stringify([
        {
          model: "gpt-5.6-terra",
          supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max"]
        }
      ])
    );

    const catalog = await repository.getModelCatalog(source.id);

    expect(catalog?.sourceId).toBe(source.id);
    expect(JSON.parse(catalog?.modelsJson ?? "null")).toEqual([
      {
        model: "gpt-5.6-terra",
        supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max"]
      }
    ]);
    expect(catalog?.updatedAt).toEqual(expect.any(String));
  });

  it("should store source-specific configuration in settings", async () => {
    const source = await repository.ensureDefaultSource();

    await repository.updateSource(source.id, {
      settings: {
        commandMode: "custom",
        command: "wsl.exe codex"
      }
    });

    const updatedSource = await repository.getSource(source.id);

    expect(updatedSource).toMatchObject({
      id: source.id,
      kind: "custom",
      settings: {
        commandMode: "custom",
        command: "wsl.exe codex"
      }
    });
  });

  it("should create each source kind from its selected configuration", async () => {
    const localSource = await repository.createSource("Local", {
      kind: "local",
      settings: { color: "teal" }
    });
    const customSource = await repository.createSource("Custom", {
      kind: "custom",
      settings: { command: "/opt/codex", hasLocalAccess: true }
    });
    const wslSource = await repository.createSource("WSL", {
      kind: "wsl",
      settings: { distro: "Ubuntu", codexCommand: "codex" }
    });
    const sshSource = await repository.createSource("SSH", {
      kind: "ssh",
      settings: { host: "codex.example.com", user: "adrien", port: 2222 }
    });

    expect(localSource).toMatchObject({ kind: "local", settings: { color: "teal" } });
    expect(customSource).toMatchObject({
      kind: "custom",
      settings: { commandMode: "custom", command: "/opt/codex", hasLocalAccess: true }
    });
    expect(wslSource).toMatchObject({
      kind: "wsl",
      settings: { distro: "Ubuntu", codexCommand: "codex" }
    });
    expect(sshSource).toMatchObject({
      kind: "ssh",
      settings: { host: "codex.example.com", user: "adrien", port: 2222 }
    });
  });

  it("should reject incomplete custom and SSH source configurations", async () => {
    await expect(repository.createSource("Custom", { kind: "custom" })).rejects.toThrow(
      "A Codex command is required"
    );
    await expect(repository.createSource("SSH", { kind: "ssh" })).rejects.toThrow(
      "An SSH host is required"
    );
  });

  it("should persist source colors in settings", async () => {
    const source = await repository.ensureDefaultSource();

    expect(source.settings.color).toBe("blue");

    await repository.updateSource(source.id, {
      settings: {
        color: "teal"
      }
    });

    const updatedSource = await repository.getSource(source.id);

    expect(updatedSource).toMatchObject({
      id: source.id,
      settings: {
        color: "teal"
      }
    });
  });

  it("should persist the latest Codex detection for a source", async () => {
    const source = await repository.ensureDefaultSource();

    await repository.updateSourceCodexDetection(source.id, {
      version: "codex-cli 0.130.0",
      checkedAt: "2026-06-01T12:00:00.000Z",
      error: null
    });

    const detectedSource = await repository.getSource(source.id);

    expect(detectedSource).toMatchObject({
      id: source.id,
      lastDetectedCodexVersion: "codex-cli 0.130.0",
      lastDetectedCodexAt: "2026-06-01T12:00:00.000Z",
      lastDetectionError: null
    });
  });

  it("should create the automatic default source with a generated id", async () => {
    const source = await repository.ensureDefaultSource();
    const sameSource = await repository.ensureDefaultSource();

    expect(source.id).not.toBe("default");
    expect(sameSource.id).toBe(source.id);
  });

  it("should clear source associations explicitly", async () => {
    const source = await repository.ensureDefaultSource();

    await repository.upsertThreadIndex([
      {
        id: "source-thread",
        codexTitle: "Source thread",
        customTitle: null,
        title: "Source thread",
        preview: "",
        model: null,
        reasoningEffort: null,
        projectName: "source-project",
        projectPath: "/tmp/source-project",
        sourceId: source.id,
        branchName: null,
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);

    await repository.clearSourceAssociations(source.id);

    const projects = await repository.listProjects();
    const project = projects.find((entry) => entry.path === "/tmp/source-project");
    const sourceThreads = await repository.listThreads({
      scope: "currentProject",
      currentProjectPath: "/tmp/source-project",
      sourceId: source.id
    });
    const orphanThreads = await repository.listThreads({
      scope: "currentProject",
      currentProjectPath: "/tmp/source-project",
      sourceId: null
    });

    expect(project?.sourceId).toBeNull();
    expect(sourceThreads).toHaveLength(0);
    expect(orphanThreads).toHaveLength(1);
    expect(orphanThreads[0]?.sourceId).toBeNull();
  });

  it("should count and delete sources", async () => {
    const source = await repository.createSource("WSL");

    await repository.upsertThreadIndex([
      {
        id: "source-thread",
        codexTitle: "Source thread",
        customTitle: null,
        title: "Source thread",
        preview: "",
        model: null,
        reasoningEffort: null,
        projectName: "source-project",
        projectPath: "/tmp/source-project",
        sourceId: source.id,
        branchName: null,
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);

    expect(await repository.getSourceProjectCount(source.id)).toBe(1);

    await repository.clearSourceAssociations(source.id);
    await repository.deleteSource(source.id);

    expect(await repository.getSource(source.id)).toBeNull();
    expect(await repository.getSourceProjectCount(source.id)).toBe(0);
  });
});

