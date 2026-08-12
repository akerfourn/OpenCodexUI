/**
 * Covers source Codex detection without starting a real process.
 */
import type { CachedSource, OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexToolVersionStatus } from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it, vi } from "vitest";

const detectionMocks = vi.hoisted(() => ({
  readCodexCommandCandidateStatuses: vi.fn(),
  readCodexVersionStatus: vi.fn()
}));

vi.mock("../src/backend/toolVersionDetection", () => detectionMocks);

import { SourceDetectionService } from "../src/backend/SourceDetectionService";

describe("SourceDetectionService", () => {
  it("should persist a ready status before returning it", async () => {
    const operations: string[] = [];
    const status = createStatus({
      status: "ready",
      version: "0.147.0",
      message: "codex-cli 0.147.0"
    });
    detectionMocks.readCodexVersionStatus.mockImplementationOnce(async () => {
      operations.push("detect");
      return status;
    });
    const updateSourceCodexDetection = vi.fn(async () => {
      operations.push("persist");
    });
    const service = createService({ updateSourceCodexDetection });

    await expect(
      service.readAndStoreCodexVersionStatus(createSource(), "codex")
    ).resolves.toBe(status);

    expect(operations).toEqual(["detect", "persist"]);
    expect(updateSourceCodexDetection).toHaveBeenCalledWith("source-1", {
      version: "0.147.0",
      checkedAt: status.checkedAt,
      error: null
    });
  });

  it("should persist an unavailable status and its diagnostic before returning it", async () => {
    const operations: string[] = [];
    const status = createStatus({
      status: "unavailable",
      version: null,
      message: "Codex CLI exited with code 127."
    });
    detectionMocks.readCodexVersionStatus.mockImplementationOnce(async () => {
      operations.push("detect");
      return status;
    });
    const updateSourceCodexDetection = vi.fn(async () => {
      operations.push("persist");
    });
    const service = createService({ updateSourceCodexDetection });

    await expect(
      service.readAndStoreCodexVersionStatus(createSource(), "codex")
    ).resolves.toBe(status);

    expect(operations).toEqual(["detect", "persist"]);
    expect(updateSourceCodexDetection).toHaveBeenCalledWith("source-1", {
      version: null,
      checkedAt: status.checkedAt,
      error: status.message
    });
  });

  it("should return the detected status without persistence when the repository is absent", async () => {
    const status = createStatus({
      status: "ready",
      version: "0.147.0",
      message: "codex-cli 0.147.0"
    });
    detectionMocks.readCodexVersionStatus.mockResolvedValueOnce(status);
    const service = new SourceDetectionService({
      cacheRepository: null,
      host: { logger: vi.fn() }
    });

    await expect(
      service.readAndStoreCodexVersionStatus(createSource(), "codex")
    ).resolves.toBe(status);
  });

  it("should absorb command candidate detection errors, log them, and return an empty list", async () => {
    const error = new Error("candidate scan failed");
    detectionMocks.readCodexCommandCandidateStatuses.mockRejectedValueOnce(error);
    const logger = vi.fn();
    const service = createService({ logger });

    await expect(service.readCommandCandidates()).resolves.toEqual([]);
    expect(logger).toHaveBeenCalledWith(
      `codex candidate detection failed: ${String(error)}`
    );
  });
});

/** Creates a detection service with only the persistence and diagnostic ports under test. */
function createService(options: {
  updateSourceCodexDetection?: OpenCodexCacheRepository["updateSourceCodexDetection"];
  logger?: (message: string) => void;
} = {}): SourceDetectionService {
  return new SourceDetectionService({
    cacheRepository: options.updateSourceCodexDetection === undefined
      ? {
          updateSourceCodexDetection: vi.fn(async () => undefined)
        }
      : { updateSourceCodexDetection: options.updateSourceCodexDetection },
    host: { logger: options.logger }
  });
}

/** Creates the smallest source needed for command resolution tests. */
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

/** Creates a deterministic tool status for persistence assertions. */
function createStatus(
  overrides: Pick<OpenCodexToolVersionStatus, "status" | "version" | "message">
): OpenCodexToolVersionStatus {
  return {
    ...overrides,
    checkedAt: "2026-08-12T00:00:00.000Z"
  };
}
