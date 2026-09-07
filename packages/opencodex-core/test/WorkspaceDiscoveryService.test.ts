import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenCodexSqliteCacheRepository, type OpenCodexCacheRepository } from
  "@open-codex-ui/opencodex-cache";
import { WorkspaceDiscoveryService } from "../src/backend/workspaces/WorkspaceDiscoveryService";
import type { GitWorktree } from "../src/backend/git/gitWorktreeParsers";

/** Produces source metadata without filesystem or branch mutation. */
function entry(path: string): GitWorktree {
  return { path, head: "a".repeat(40), branch: "refs/heads/topic", bare: false,
    detached: false, lockedReason: null, prunableReason: null };
}

describe("source-owned workspace discovery", () => {
  let directory: string;
  let cache: OpenCodexCacheRepository;
  let projectId: string;
  let service: WorkspaceDiscoveryService;
  const client = { getMetadata: vi.fn() };
  const clients = { ensureClient: vi.fn() };
  const git = { repositoryPath: vi.fn(), list: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-discovery-"));
    cache = createOpenCodexSqliteCacheRepository({ directory });
    projectId = (await cache.workspaces.resolvePath("/repo", "source")).projectId;
    client.getMetadata.mockResolvedValue({ isDirectory: true, isSymlink: false });
    clients.ensureClient.mockResolvedValue(client);
    git.repositoryPath.mockResolvedValue("/repo/.git");
    git.list.mockResolvedValue([entry("/repo"), entry("/external")]);
    service = new WorkspaceDiscoveryService(cache.workspaces, clients, git);
  });

  afterEach(async () => {
    await cache.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("should verify external repository membership before registering the checkout", async () => {
    const result = await service.discover(projectId, "source");
    expect(result.skipped).toEqual([]);
    expect(result.workspaces).toHaveLength(2);
    expect(result.workspaces).toContainEqual(expect.objectContaining({ path: "/external", managed: false }));
    expect(git.repositoryPath).toHaveBeenCalledWith("/external", "source");
    expect(client.getMetadata).toHaveBeenCalledWith("/external");
  });

  it("should reject a different source before source access", async () => {
    await expect(service.discover(projectId, "other-source")).rejects.toThrow("owning source");
    expect(clients.ensureClient).not.toHaveBeenCalled();
    expect(git.list).not.toHaveBeenCalled();
  });

  it("should retain known catalogue entries when Git stops listing them", async () => {
    const previous = await service.discover(projectId, "source");
    git.list.mockResolvedValue([entry("/repo")]);
    expect((await service.discover(projectId, "source")).workspaces).toEqual(previous.workspaces);
  });

  it("should report unsupported, prunable and foreign repository paths without adopting them", async () => {
    git.list.mockResolvedValue([entry("/repo"), entry("relative"),
      { ...entry("/missing"), prunableReason: "missing" }, entry("/foreign")]);
    git.repositoryPath.mockImplementation(async (path) => path === "/foreign" ? "/foreign/.git" : "/repo/.git");
    const result = await service.discover(projectId, "source");
    expect(result.skipped).toEqual([
      { path: "relative", reason: "unsupportedPath" }, { path: "/missing", reason: "unavailable" },
      { path: "/foreign", reason: "repositoryMismatch" }
    ]);
    expect(result.workspaces).toHaveLength(1);
    expect(client.getMetadata).not.toHaveBeenCalledWith("relative");
  });

  it.each(["missing", "symlink"])("should exclude an unavailable checkout: %s", async (condition) => {
    client.getMetadata.mockImplementation(async (path) => {
      if (path === "/external" && condition === "missing") throw new Error("File not found");
      return { isDirectory: true, isSymlink: path === "/external" };
    });
    expect((await service.discover(projectId, "source")).skipped)
      .toEqual([{ path: "/external", reason: "unavailable" }]);
    expect(await cache.workspaces.list(projectId)).toHaveLength(1);
  });

  it("should not publish a partial batch when source access fails", async () => {
    git.list.mockResolvedValue([entry("/repo"), entry("/external"), entry("/unreachable")]);
    client.getMetadata.mockImplementation(async (path) => {
      if (path === "/unreachable") throw new Error("Source disconnected");
      return { isDirectory: true, isSymlink: false };
    });
    await expect(service.discover(projectId, "source")).rejects.toThrow("Source disconnected");
    expect(await cache.workspaces.list(projectId)).toHaveLength(1);
  });

  it("should reject repository replacement before publication", async () => {
    git.repositoryPath.mockResolvedValueOnce("/repo/.git")
      .mockResolvedValueOnce("/repo/.git").mockResolvedValueOnce("/repo/.git")
      .mockResolvedValueOnce("/replacement/.git");
    await expect(service.discover(projectId, "source")).rejects.toThrow("identity changed");
    expect(await cache.workspaces.list(projectId)).toHaveLength(1);
  });
});
