import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenCodexSqliteCacheRepository, type OpenCodexCacheRepository } from
  "@open-codex-ui/opencodex-cache";
import type { OpenCodexWorkspaceCreateInput } from "@open-codex-ui/opencodex-protocol";
import { WorkspaceCreationService } from "../src/backend/workspaces/WorkspaceCreationService";
import type { GitWorktreeCreationLifecycle } from "../src/backend/git/GitWorktreeService";

const head = "a".repeat(40);
const entry = { path: "/secondary", head, branch: "refs/heads/topic", detached: false,
  bare: false, lockedReason: null, prunableReason: null };

describe("durable workspace creation", () => {
  let directory: string;
  let cache: OpenCodexCacheRepository;
  let service: WorkspaceCreationService;
  let input: OpenCodexWorkspaceCreateInput;
  let destinationExists: boolean;
  const client = { request: vi.fn(), getMetadata: vi.fn() };
  const clients = { ensureClient: vi.fn() };
  const git = { create: vi.fn(), list: vi.fn(), repositoryPath: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-creation-"));
    cache = createOpenCodexSqliteCacheRepository({ directory });
    const primary = await cache.workspaces.resolvePath("/repo", "source");
    input = { projectId: primary.projectId, sourceId: "source", destinationPath: "/secondary",
      start: { mode: "newBranch", branchName: "topic", startPoint: "HEAD" } };
    destinationExists = false;
    client.request.mockResolvedValue({ config: { projects: { "/repo": { trust_level: "trusted" } } } });
    client.getMetadata.mockImplementation(async (value) => {
      if (value === "/secondary" && !destinationExists) {
        throw new Error("File not found");
      }
      return { isDirectory: true, isSymlink: false };
    });
    clients.ensureClient.mockResolvedValue(client);
    git.repositoryPath.mockResolvedValue("/repo/.git");
    git.list.mockImplementation(async () => {
      const entries = [{ ...entry, path: "/repo", branch: "refs/heads/main" }];
      if (destinationExists) entries.push(entry);
      return entries;
    });
    git.create.mockImplementation(async (_project, _source, _destination, _start, lifecycle: GitWorktreeCreationLifecycle) => {
      await lifecycle.beforeDispatch(head, "refs/heads/topic");
      destinationExists = true;
      await lifecycle.afterSuccess();
      return await git.list();
    });
    service = new WorkspaceCreationService(cache.workspaces, clients, git);
  });

  afterEach(async () => {
    await cache.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("should publish a managed secondary under the same project without changing the primary", async () => {
    const result = await service.create(input);
    expect(result).toMatchObject({ projectId: input.projectId, sourceId: "source", path: "/secondary",
      managed: true, isPrimary: false });
    expect(await cache.workspaces.list(input.projectId)).toHaveLength(2);
    expect(await service.pending(input.projectId)).toEqual([]);
    expect(git.create).toHaveBeenCalledWith("/repo", "source", "/secondary", input.start, expect.any(Object));
  });

  it.each(["source", "path", "trust", "existing"])("should refuse invalid %s before mutation", async (reason) => {
    if (reason === "source") input.sourceId = "other";
    if (reason === "path") input.destinationPath = "relative";
    if (reason === "trust") client.request.mockResolvedValue({ config: {} });
    if (reason === "existing") destinationExists = true;
    await expect(service.create(input)).rejects.toThrow();
    expect(git.create).not.toHaveBeenCalled();
    expect(await service.pending(input.projectId)).toEqual([]);
  });

  it("should refuse an occupied branch before dispatch and release preparation", async () => {
    input.start = { mode: "existingBranch", branchName: "main" };
    await expect(service.create(input)).rejects.toThrow("already checked out");
    expect(git.create).not.toHaveBeenCalled();
    expect(await service.pending(input.projectId)).toEqual([]);
  });

  it("should recover confirmed Git completion after a lost listing and cache reopening", async () => {
    git.create.mockImplementationOnce(async (_a, _b, _c, _d, lifecycle: GitWorktreeCreationLifecycle) => {
      await lifecycle.beforeDispatch(head, "refs/heads/topic");
      destinationExists = true;
      await lifecycle.afterSuccess();
      throw new Error("Listing response lost");
    });
    await expect(service.create(input)).rejects.toThrow("Listing response lost");
    const pending = (await service.pending(input.projectId))[0]!;
    expect(pending).toMatchObject({ state: "uncertain", gitConfirmed: true });
    await cache.close();
    cache = createOpenCodexSqliteCacheRepository({ directory });
    service = new WorkspaceCreationService(cache.workspaces, clients, git);

    expect(await service.reconcile(pending.id)).toMatchObject({ id: pending.workspaceId, managed: true });
    expect(git.create).toHaveBeenCalledTimes(1);
    expect(await service.pending(input.projectId)).toEqual([]);
  });

  it("should not infer Git completion from a visible but potentially unfinished checkout", async () => {
    git.create.mockImplementationOnce(async (_a, _b, _c, _d, lifecycle: GitWorktreeCreationLifecycle) => {
      await lifecycle.beforeDispatch(head, "refs/heads/topic");
      destinationExists = true;
      throw new Error("Process response lost");
    });
    await expect(service.create(input)).rejects.toThrow("Process response lost");
    const pending = (await service.pending(input.projectId))[0]!;
    await expect(service.reconcile(pending.id)).rejects.toThrow("completion is uncertain");
    expect(await cache.workspaces.list(input.projectId)).toHaveLength(1);
    expect(git.create).toHaveBeenCalledTimes(1);
  });

  it("should retain a confirmed creation when its checkout identity disagrees", async () => {
    git.create.mockImplementationOnce(async (_a, _b, _c, _d, lifecycle: GitWorktreeCreationLifecycle) => {
      await lifecycle.beforeDispatch(head, "refs/heads/topic");
      destinationExists = true;
      await lifecycle.afterSuccess();
      return [{ ...entry, head: "b".repeat(40) }];
    });
    await expect(service.create(input)).rejects.toThrow("does not match");
    expect(await service.pending(input.projectId)).toMatchObject([{ gitConfirmed: true, state: "uncertain" }]);
    expect(await cache.workspaces.list(input.projectId)).toHaveLength(1);
  });

  it("should cancel interrupted preparation without touching Git or its source", async () => {
    const primary = (await cache.workspaces.list(input.projectId))[0]!;
    const pending = await cache.workspaces.creations.begin({
      primaryWorkspaceId: primary.id, sourceId: "source", projectPath: "/repo",
      repositoryPath: "/repo/.git", destinationPath: "/secondary", start: input.start
    });
    expect(await service.reconcile(pending.id)).toBeNull();
    expect(clients.ensureClient).not.toHaveBeenCalled();
    expect(git.create).not.toHaveBeenCalled();
    expect(await service.pending(input.projectId)).toEqual([]);
  });

  it("should not mistake an unsupported metadata API for an absent destination", async () => {
    client.getMetadata.mockRejectedValue(new Error("Method not found"));
    await expect(service.create(input)).rejects.toThrow("Method not found");
    expect(git.create).not.toHaveBeenCalled();
    expect(await service.pending(input.projectId)).toEqual([]);
  });

  it("should reject recovery while creation is still preparing locally", async () => {
    client.request.mockImplementationOnce(async () => {
      const pending = (await service.pending(input.projectId))[0]!;
      await expect(service.reconcile(pending.id)).rejects.toThrow("still running locally");
      return { config: { projects: { "/repo": { trust_level: "trusted" } } } };
    });
    await service.create(input);
  });
});
