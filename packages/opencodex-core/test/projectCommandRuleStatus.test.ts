import path from "node:path";

import type {
  CachedProject,
  CachedProjectCommandRuleFileState,
  CachedSource
} from "@open-codex-ui/opencodex-cache";
import { describe, expect, it } from "vitest";

import {
  createUnsupportedStatus,
  getRulesFilePath,
  isSupportedSource,
  resolveFileStatus
} from "../src/backend/projectCommandRuleStatus";

describe("project command rule status helpers", () => {
  it("should resolve the managed file below the project rules directory", () => {
    expect(getRulesFilePath("/workspace/project")).toBe(
      path.join("/workspace/project", ".codex", "rules", "opencodex-ui.rules")
    );
  });

  it("should support only sources with local filesystem access", () => {
    expect(isSupportedSource(createLocalSource())).toBe(true);
    expect(isSupportedSource(createCustomSource(true))).toBe(true);
    expect(isSupportedSource(createCustomSource(false))).toBe(false);
    expect(isSupportedSource(createWslSource())).toBe(false);
  });

  it("should create an unsupported status without a managed file path", () => {
    expect(createUnsupportedStatus(createProject(), "desired-hash", createFileState()))
      .toEqual({
        projectId: "project-1",
        sourceId: "source-1",
        filePath: null,
        fileStatus: "unsupported",
        generatedHash: "generated-hash",
        currentHash: null,
        desiredHash: "desired-hash",
        isSupported: false,
        runtimeState: "ready",
        runtimeMessage: null
      });
  });

  it("should report synchronized when the current content matches the desired content", () => {
    expect(resolveFileStatus("previous-hash", "desired-hash", "desired-hash", createFileState()))
      .toBe("synchronized");
  });

  it("should report external when the current content differs from the generated content", () => {
    expect(resolveFileStatus("generated-hash", "external-hash", "desired-hash", createFileState()))
      .toBe("external");
  });

  it("should report external for an unmanaged file that differs from desired content", () => {
    expect(resolveFileStatus(null, "external-hash", "desired-hash", null)).toBe("external");
  });

  it("should report not generated when neither current nor generated content exists", () => {
    expect(resolveFileStatus(null, null, "desired-hash", null)).toBe("notGenerated");
  });

  it("should report pending when the last generated content needs synchronization", () => {
    expect(resolveFileStatus("generated-hash", "generated-hash", "desired-hash", createFileState()))
      .toBe("pending");
  });
});

/** Creates a representative project for status mapping tests. */
function createProject(): CachedProject {
  return {
    id: "project-1",
    sourceId: "source-1",
    path: "/workspace/project",
    defaultName: "project",
    displayName: null,
    isHidden: false,
    preferences: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    editedAt: "2026-01-01T00:00:00.000Z"
  };
}

/** Creates persisted state for a previously generated rules file. */
function createFileState(): CachedProjectCommandRuleFileState {
  return {
    projectId: "project-1",
    generatedHash: "generated-hash",
    generatedPath: "/workspace/project/.codex/rules/opencodex-ui.rules",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

/** Creates a local source with direct filesystem access. */
function createLocalSource(): CachedSource {
  return {
    ...createSourceBase(),
    kind: "local",
    settings: {
      commandMode: "auto",
      command: null,
      color: "blue",
      openFolderCommand: null,
      openFileCommand: null
    }
  };
}

/** Creates a custom source with configurable host filesystem access. */
function createCustomSource(hasLocalAccess: boolean): CachedSource {
  return {
    ...createSourceBase(),
    kind: "custom",
    settings: {
      commandMode: "custom",
      command: "codex app-server",
      color: "blue",
      hasLocalAccess,
      openFolderCommand: null,
      openFileCommand: null
    }
  };
}

/** Creates a WSL source that cannot use host-local rule file operations. */
function createWslSource(): CachedSource {
  return {
    ...createSourceBase(),
    kind: "wsl",
    settings: {
      color: "blue",
      distro: "Ubuntu",
      codexCommand: "codex"
    }
  };
}

/** Creates metadata shared by source fixtures. */
function createSourceBase() {
  return {
    id: "source-1",
    name: "Source",
    lastDetectedCodexVersion: null,
    lastDetectedCodexAt: null,
    lastDetectionError: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}
