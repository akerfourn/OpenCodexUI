/**
 * Covers source-owned thread synchronization without SQLite, processes, or a real filesystem.
 */
import type { CachedSource, CachedThreadSummary } from "@open-codex-ui/opencodex-cache";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexSettings,
  OpenCodexToolVersionStatus
} from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it, vi } from "vitest";

import { THREAD_SOURCE_KINDS } from "../src/backend/constants";
import { SourceThreadSyncService } from "../src/backend/SourceThreadSyncService";

describe("SourceThreadSyncService", () => {
  it("should read a ready source, write its index, and clean up afterwards", async () => {
    const operations: string[] = [];
    const fixture = createFixture({
      upsertThreadIndex: vi.fn(async () => {
        operations.push("write");
      }),
      deleteEmptyUnsyncedThreads: vi.fn(async (projectPath) => {
        operations.push(`cleanup:${projectPath}`);
        return 0;
      })
    });

    await fixture.service.syncSource(fixture.source);

    expect(fixture.ensureClient).toHaveBeenCalledWith(fixture.source.id);
    expect(operations).toEqual(["write", "cleanup:/workspace/project"]);
  });

  it("should skip an unavailable source before starting its client", async () => {
    const fixture = createFixture({
      status: createStatus({
        status: "unavailable",
        version: null,
        message: "Codex is unavailable"
      })
    });

    await expect(fixture.service.syncSource(fixture.source)).resolves.toBeUndefined();

    expect(fixture.ensureClient).not.toHaveBeenCalled();
    expect(fixture.upsertThreadIndex).not.toHaveBeenCalled();
    expect(fixture.deleteEmptyUnsyncedThreads).not.toHaveBeenCalled();
    expect(fixture.logger).toHaveBeenCalledWith(
      "skipping source sync because Codex is not usable for Source: Codex is unavailable"
    );
  });

  it("should reject an outdated source when outdated Codex is disabled", async () => {
    const fixture = createFixture({
      status: createStatus({
        status: "outdated",
        version: "0.146.0",
        message: "Codex CLI is outdated"
      })
    });

    await fixture.service.syncSource(fixture.source);

    expect(fixture.ensureClient).not.toHaveBeenCalled();
    expect(fixture.logger).toHaveBeenCalledWith(
      "skipping source sync because Codex is not usable for Source: Codex CLI is outdated"
    );
  });

  it("should synchronize an outdated source when outdated Codex is explicitly allowed", async () => {
    const fixture = createFixture({
      allowOutdatedCodex: true,
      status: createStatus({
        status: "outdated",
        version: "0.146.0",
        message: "Codex CLI is outdated"
      })
    });

    await fixture.service.syncSource(fixture.source);

    expect(fixture.ensureClient).toHaveBeenCalledOnce();
    expect(fixture.upsertThreadIndex).toHaveBeenCalledOnce();
  });

  it("should pass the historical thread-list options and follow pagination cursors", async () => {
    const fixture = createFixture({
      pages: [
        {
          data: [createRawThread("thread-1", "/workspace/first")],
          nextCursor: "cursor-1"
        },
        {
          data: [createRawThread("thread-2", "/workspace/second")]
        }
      ]
    });

    await fixture.service.syncSource(fixture.source);

    expect(fixture.client.listThreads).toHaveBeenNthCalledWith(1, {
      limit: 100,
      sortKey: "updated_at",
      sortDirection: "desc",
      sourceKinds: THREAD_SOURCE_KINDS
    });
    expect(fixture.client.listThreads).toHaveBeenNthCalledWith(2, {
      limit: 100,
      sortKey: "updated_at",
      sortDirection: "desc",
      sourceKinds: THREAD_SOURCE_KINDS,
      cursor: "cursor-1"
    });
    expect(fixture.upsertThreadIndex).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "thread-1" }),
        expect.objectContaining({ id: "thread-2" })
      ])
    );
  });

  it("should canonicalize source ids and enrich project visibility through source metadata", async () => {
    const fixture = createFixture({
      pages: [
        {
          data: [
            createRawThread("thread-1", "/remote/project"),
            createRawThread("thread-2", "/remote/project")
          ]
        }
      ],
      metadataIsDirectory: false
    });

    await fixture.service.syncSource(fixture.source);

    const summaries = vi.mocked(fixture.upsertThreadIndex).mock.calls[0]?.[0] ?? [];
    expect(summaries).toHaveLength(2);
    expect(summaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "thread-1",
          sourceId: fixture.source.id,
          projectPath: "/remote/project",
          projectHidden: true
        }),
        expect.objectContaining({
          id: "thread-2",
          sourceId: fixture.source.id,
          projectHidden: true
        })
      ])
    );
    expect(fixture.client.request).toHaveBeenCalledOnce();
    expect(fixture.client.request).toHaveBeenCalledWith("fs/getMetadata", {
      path: "/remote/project"
    });
  });

  it("should write an empty index even when the source reports no threads", async () => {
    const fixture = createFixture({ pages: [{ data: [] }] });

    await fixture.service.syncSource(fixture.source);

    expect(fixture.upsertThreadIndex).toHaveBeenCalledWith([]);
    expect(fixture.deleteEmptyUnsyncedThreads).not.toHaveBeenCalled();
  });

  it("should clean each raw project path once, ignore null paths, and preserve write order", async () => {
    const operations: string[] = [];
    const fixture = createFixture({
      pages: [
        {
          data: [
            createRawThread("thread-1", "/workspace/project"),
            createRawThread("thread-2", "/workspace/project"),
            createRawThread("thread-3", null)
          ]
        }
      ],
      upsertThreadIndex: vi.fn(async () => {
        operations.push("write");
      }),
      deleteEmptyUnsyncedThreads: vi.fn(async (projectPath, sourceId) => {
        operations.push(`cleanup:${projectPath}:${sourceId}`);
        return 0;
      })
    });

    await fixture.service.syncSource(fixture.source);

    expect(operations).toEqual([`write`, `cleanup:/workspace/project:${fixture.source.id}`]);
    expect(fixture.deleteEmptyUnsyncedThreads).toHaveBeenCalledOnce();
  });

  it("should absorb an index write error, log it, and still clean up", async () => {
    const operations: string[] = [];
    const error = new Error("index unavailable");
    const fixture = createFixture({
      upsertThreadIndex: vi.fn(async () => {
        operations.push("write");
        throw error;
      }),
      deleteEmptyUnsyncedThreads: vi.fn(async () => {
        operations.push("cleanup");
        return 0;
      })
    });

    await expect(fixture.service.syncSource(fixture.source)).resolves.toBeUndefined();

    expect(operations).toEqual(["write", "cleanup"]);
    expect(fixture.logger).toHaveBeenCalledWith(
      `thread cache index write failed: ${String(error)}`
    );
  });

  it("should absorb a cleanup error, log it, and stop trying later paths", async () => {
    const operations: string[] = [];
    const error = new Error("cleanup unavailable");
    const fixture = createFixture({
      pages: [
        {
          data: [
            createRawThread("thread-1", "/workspace/first"),
            createRawThread("thread-2", "/workspace/second")
          ]
        }
      ],
      upsertThreadIndex: vi.fn(async () => {
        operations.push("write");
      }),
      deleteEmptyUnsyncedThreads: vi.fn(async (projectPath) => {
        operations.push(`cleanup:${projectPath}`);
        throw error;
      })
    });

    await expect(fixture.service.syncSource(fixture.source)).resolves.toBeUndefined();

    expect(operations).toEqual(["write", "cleanup:/workspace/first"]);
    expect(fixture.deleteEmptyUnsyncedThreads).toHaveBeenCalledOnce();
    expect(fixture.logger).toHaveBeenCalledWith(
      `empty thread cache cleanup failed: ${String(error)}`
    );
  });

  it("should propagate source detection errors without starting the client", async () => {
    const error = new Error("detection failed");
    const fixture = createFixture({
      readAndStoreCodexVersionStatus: vi.fn(async () => {
        throw error;
      })
    });

    await expect(fixture.service.syncSource(fixture.source)).rejects.toBe(error);
    expect(fixture.ensureClient).not.toHaveBeenCalled();
  });

  it("should propagate thread-list RPC errors without writing or cleaning the cache", async () => {
    const error = new Error("thread/list failed");
    const fixture = createFixture({
      listThreads: vi.fn(async () => {
        throw error;
      })
    });

    await expect(fixture.service.syncSource(fixture.source)).rejects.toBe(error);
    expect(fixture.upsertThreadIndex).not.toHaveBeenCalled();
    expect(fixture.deleteEmptyUnsyncedThreads).not.toHaveBeenCalled();
  });
});

type FixtureOptions = {
  allowOutdatedCodex?: boolean;
  status?: OpenCodexToolVersionStatus;
  pages?: Array<{ data: unknown[]; nextCursor?: string }>;
  metadataIsDirectory?: boolean;
  listThreads?: CodexAppServerClient["listThreads"];
  upsertThreadIndex?: (threads: CachedThreadSummary[]) => Promise<void>;
  deleteEmptyUnsyncedThreads?: (
    projectPath: string,
    sourceId?: string | null
  ) => Promise<number>;
  readAndStoreCodexVersionStatus?: (
    source: CachedSource,
    fallbackCommand: string
  ) => Promise<OpenCodexToolVersionStatus>;
};

/** Builds source, client, detection, cache, settings, and diagnostics doubles for one sync. */
function createFixture(options: FixtureOptions = {}) {
  const source = createSource();
  const pages = [...(options.pages ?? [{ data: [createRawThread("thread-1", "/workspace/project")] }])];
  const listThreads = options.listThreads ?? vi.fn(async () => pages.shift() ?? { data: [] });
  const request = vi.fn(async () => ({
    isDirectory: options.metadataIsDirectory ?? true
  }));
  const client = {
    listThreads,
    request
  } as unknown as CodexAppServerClient;
  const ensureClient = vi.fn(async () => client);
  const upsertThreadIndex = vi.fn(options.upsertThreadIndex ?? (async () => undefined));
  const deleteEmptyUnsyncedThreads = vi.fn(
    options.deleteEmptyUnsyncedThreads ?? (async () => 0)
  );
  const logger = vi.fn();
  const status = options.status ?? createStatus({
    status: "ready",
    version: "0.147.0",
    message: "codex-cli 0.147.0"
  });
  const readAndStoreCodexVersionStatus = vi.fn(
    options.readAndStoreCodexVersionStatus ?? (async () => status)
  );
  const settings = createSettings(options.allowOutdatedCodex ?? false);
  const service = new SourceThreadSyncService({
    cacheRepository: {
      upsertThreadIndex,
      deleteEmptyUnsyncedThreads
    },
    settings: { getSettings: vi.fn(() => settings) },
    clients: { ensureClient },
    detection: { readAndStoreCodexVersionStatus },
    host: { logger }
  });

  return {
    service,
    source,
    client,
    ensureClient,
    upsertThreadIndex,
    deleteEmptyUnsyncedThreads,
    logger,
    readAndStoreCodexVersionStatus
  };
}

/** Creates the smallest source whose project paths belong to the Codex filesystem. */
function createSource(): CachedSource {
  return {
    id: "source-1",
    name: "Source",
    kind: "custom",
    settings: {
      commandMode: "custom",
      command: "codex",
      hasLocalAccess: false,
      color: "blue",
      openFolderCommand: null,
      openFileCommand: null
    },
    lastDetectedCodexVersion: null,
    lastDetectedCodexAt: null,
    lastDetectionError: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

/** Creates the complete settings snapshot required by the source sync policy. */
function createSettings(allowOutdatedCodex: boolean): OpenCodexSettings {
  return {
    codexCommand: "codex",
    codexReleaseCheck: {
      latestVersion: null,
      checkedAt: null,
      error: null
    },
    defaultSourceId: "source-1",
    defaultUsageLimitId: null,
    defaultModel: null,
    defaultReasoningEffort: null,
    commitMessageModel: null,
    commitMessageReasoningEffort: null,
    commitMessageLanguage: "en",
    showActivityPanel: true,
    experimentalApi: false,
    allowTurnSteering: true,
    language: "en",
    colorScheme: "system",
    enterKeyBehavior: "smart",
    versioningVocabulary: "technical",
    desktopNotifications: {
      turnCompleted: false,
      approvalRequested: false
    },
    discordRichPresenceEnabled: false,
    onboardingCompleted: true,
    allowOutdatedCodex,
    developerMode: false,
    performanceMonitoringEnabled: false,
    advancedPerformanceMonitoringEnabled: false
  };
}

/** Creates one raw thread/list row consumed by the real Codex reader. */
function createRawThread(id: string, projectPath: string | null): Record<string, unknown> {
  return {
    id,
    name: id,
    cwd: projectPath,
    preview: `${id} preview`,
    updatedAt: "2026-08-12T00:00:00.000Z",
    threadSource: "cli",
    gitInfo: { branch: "main" }
  };
}

/** Creates a deterministic tool status for readiness assertions. */
function createStatus(
  overrides: Pick<OpenCodexToolVersionStatus, "status" | "version" | "message">
): OpenCodexToolVersionStatus {
  return {
    ...overrides,
    checkedAt: "2026-08-12T00:00:00.000Z"
  };
}
