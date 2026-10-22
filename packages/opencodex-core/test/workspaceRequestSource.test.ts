import { describe, expect, it } from "vitest";
import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";
import { requireLegacyWorkspaceAvailable, workspaceRequestSource } from "../src/backend/workspaces/workspaceRequestSource";

const workspace: OpenCodexProjectWorkspace = { id: "workspace", projectId: "project", sourceId: "source",
  path: "C:\\Repo\\Topic", isPrimary: false, managed: true, removedAt: null, removalPending: true };

/** Replaces only persistence reads, preserving real source and path resolution. */
function repository(): OpenCodexCacheRepository {
  return { listProjects: async () => [{ id: "project", sourceId: "source" }], workspaces: {
    moves: { list: async () => [] },
    get: async () => workspace, getForThread: async () => workspace, list: async () => [workspace]
  } } as unknown as OpenCodexCacheRepository;
}

describe("workspace request activity ownership", () => {
  it("should resolve nested file targets and cached thread owners before acquiring the source gate", async () => {
    await expect(workspaceRequestSource(repository(), { type: "workspaceFiles.list", target: {
      sourceId: "source", projectId: "project", workspaceId: "workspace", workspacePath: workspace.path, path: ""
    } }, null, "default")).resolves.toBe("source");
    await expect(workspaceRequestSource(repository(), { type: "threads.runtimeStatus.read", threadId: "thread" },
      null, "default")).resolves.toBe("source");
  });

  it("should use the configured legacy default while keeping global metadata requests independent", async () => {
    await expect(workspaceRequestSource(null, { type: "git.status", projectPath: "/legacy", sourceId: null },
      null, "default")).resolves.toBe("default");
    await expect(workspaceRequestSource(null, { type: "projects.list" }, null, "default")).resolves.toBeNull();
  });

  it("should reject legacy requests to a pending Windows checkout regardless of casing and separators", async () => {
    await expect(requireLegacyWorkspaceAvailable(repository(), { type: "git.status",
      projectPath: "c:/repo/topic", sourceId: "source" }, "source")).rejects.toThrow("pending removal");
    await expect(requireLegacyWorkspaceAvailable(repository(), { type: "git.status",
      projectPath: "C:\\repo\\topic-other", sourceId: "source" }, "source")).resolves.toBeUndefined();
    await expect(requireLegacyWorkspaceAvailable(repository(), { type: "git.status",
      projectPath: workspace.path, sourceId: "other-source" }, "other-source")).resolves.toBeUndefined();
  });
});
