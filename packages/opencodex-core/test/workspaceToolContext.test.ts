import { describe, expect, it, vi } from "vitest";
import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexProjectWorkspace, OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";
import { resolveWorkspaceToolRequest } from "../src/backend/workspaces/workspaceToolContext";

/** Source-local workspace fixture; no host filesystem calls are permitted. */
function fixture(patch: Partial<OpenCodexProjectWorkspace> = {}) {
  const workspace = { id: "workspace", projectId: "project", sourceId: "wsl-source",
    path: "/work/app", isPrimary: false, managed: false, removedAt: null, ...patch };
  const get = vi.fn(async () => workspace);
  const repository = { workspaces: { get }, getProjectCommand: vi.fn(async () => ({ projectId: "project" })) } as unknown as OpenCodexCacheRepository;
  return { repository, get };
}

describe("workspace tool dispatch", () => {
  it("should preserve legacy requests without storage or source fallback", async () => {
    const request: OpenCodexRequest = { type: "git.status", projectPath: "/legacy", sourceId: "source" };
    expect(await resolveWorkspaceToolRequest(null, request)).toBe(request);
  });

  it.each(["git.status", "docker.compose.snapshot.read", "files.search", "skills.search",
    "system.openProject", "system.openProjectFolder", "system.openProjectTerminal"])(
    "should resolve %s in the owning source without changing the input", async (type) => {
      const { repository } = fixture();
      const request = { type, workspaceId: "workspace", projectPath: "/work/app", sourceId: null,
        query: "file" } as OpenCodexRequest;
      const result = await resolveWorkspaceToolRequest(repository, request);
      expect(result).toMatchObject({ projectPath: "/work/app", sourceId: "wsl-source" });
      expect(request).toHaveProperty("sourceId", null);
    });

  it.each([
    { projectPath: "/wrong", sourceId: "wsl-source", message: "path does not match" },
    { projectPath: "/work/app", sourceId: "other", message: "source does not own" }
  ])("should reject conflicting context before dispatch: $message", async ({ message, ...hints }) => {
    const { repository } = fixture();
    await expect(resolveWorkspaceToolRequest(repository,
      { type: "git.status", workspaceId: "workspace", ...hints })).rejects.toThrow(message);
  });

  it.each([{ sourceId: null }, { removedAt: "2026-01-01" }])(
    "should reject unavailable workspaces", async (patch) => {
      const { repository } = fixture(patch);
      await expect(resolveWorkspaceToolRequest(repository, { type: "projects.context.sync",
        workspaceId: "workspace", projectId: "project" })).rejects.toThrow("unavailable");
    });

  it("should reject cross-project rules and commands", async () => {
    const { repository } = fixture({ projectId: "other" });
    await expect(resolveWorkspaceToolRequest(repository, { type: "projectRules.apply",
      workspaceId: "workspace", projectId: "project" })).rejects.toThrow("requested project");
    await expect(resolveWorkspaceToolRequest(repository, { type: "projectCommands.run",
      workspaceId: "workspace", commandId: "command", projectPath: "/work/app", sourceId: "wsl-source" }))
      .rejects.toThrow("Command does not belong");
  });
});
