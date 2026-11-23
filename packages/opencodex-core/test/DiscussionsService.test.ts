import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenCodexSqliteCacheRepository, type OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import { ThreadRuntimeHandler } from "../src/backend/threads/ThreadRuntimeHandler";
import { RuntimeEventDispatcher } from "../src/backend/runtime/RuntimeEventDispatcher";
import type { ProjectSourcePort, RuntimeSettingsPort } from "../src/backend/runtime/runtimePorts";

const draftId = "draft:11111111-1111-4111-8111-111111111111";

describe("personal discussions in the shared runtime", () => {
  let directory: string;
  let cache: OpenCodexCacheRepository;
  let handler: ThreadRuntimeHandler;
  const client = {
    getCodexHome: vi.fn(), createDirectory: vi.fn(), startThread: vi.fn(), getMetadata: vi.fn(),
    listThreads: vi.fn(), readThread: vi.fn()
  };
  const clients = { ensureClient: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "opencodex-discussions-"));
    cache = createOpenCodexSqliteCacheRepository({ directory });
    clients.ensureClient.mockResolvedValue(client as unknown as CodexAppServerClient);
    client.getCodexHome.mockResolvedValue("/source/codex-home");
    client.createDirectory.mockResolvedValue({});
    client.getMetadata.mockResolvedValue({ isDirectory: true });
    client.listThreads.mockResolvedValue({ data: [], nextCursor: null });
    client.startThread.mockImplementation(async (parameters) => ({
      thread: { id: "native-personal", cwd: parameters.cwd, preview: "", createdAt: 1, updatedAt: 1,
        source: "appServer", turns: [], status: { type: "idle" } },
      model: "selected-default", reasoningEffort: "medium", cwd: parameters.cwd
    }));
    handler = new ThreadRuntimeHandler({
      backendOptions: { projectPath: "/host/wrong-default" }, cacheRepository: cache, clients,
      settings: { getSettings: () => ({ defaultModel: "selected-default", defaultReasoningEffort: "medium" }) } as unknown as Pick<RuntimeSettingsPort, "getSettings">,
      projects: {
        resolveSource: async (id: string) => ({ id }),
        cacheProject: async (cwd: string, sourceId: string) => await cache.upsertProject(cwd, sourceId),
        readCachedProjects: async () => await cache.listProjects()
      } as unknown as Pick<ProjectSourcePort, "resolveSource" | "cacheProject" | "readCachedProjects">,
      events: new RuntimeEventDispatcher({ emitToHost: () => undefined }),
      handleClientError: (error) => { throw error; }
    });
  });

  afterEach(async () => {
    await cache.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it.each([
    ["/source/codex-home", "/source/codex-home/opencodex-ui/discussions/11111111-1111-4111-8111-111111111111"],
    ["C:\\Users\\user\\.codex", "C:\\Users\\user\\.codex\\opencodex-ui\\discussions\\11111111-1111-4111-8111-111111111111"]
  ])("should allocate a private directory in the source filesystem %s", async (home, expected) => {
    client.getCodexHome.mockResolvedValue(home);

    const discussion = await handler.createDiscussion("explicit-source", draftId);

    expect(discussion.environment).toMatchObject({ kind: "discussion", sourceId: "explicit-source", path: expected });
    expect(discussion.threads[0]).toMatchObject({ id: "native-personal", discussionEnvironmentId: discussion.environment.id });
    expect(client.createDirectory).toHaveBeenCalledWith(expected);
    expect(client.startThread).toHaveBeenCalledWith({ cwd: expected, model: "selected-default" });
    expect(clients.ensureClient.mock.calls.every(([sourceId]) => sourceId === "explicit-source")).toBe(true);
    expect(await cache.listProjects()).toEqual([]);
    const workspace = await cache.workspaces.getForThread("native-personal");
    expect(workspace).toMatchObject({ path: expected, sourceId: "explicit-source", isPrimary: true });
    expect(await cache.workspaces.listReservations(workspace!.id)).toEqual([]);
  });

  it("should coalesce first-send retries and restore the same native identity after reopening storage", async () => {
    const [first, second] = await Promise.all([
      handler.createDiscussion("source", draftId), handler.createDiscussion("source", draftId)
    ]);
    const retried = await handler.createDiscussion("source", draftId);
    await cache.close();
    cache = createOpenCodexSqliteCacheRepository({ directory });
    clients.ensureClient.mockClear();

    const restored = await cache.listDiscussionEnvironments();
    expect(second.threads[0].id).toBe(first.threads[0].id);
    expect(retried.threads[0].id).toBe(first.threads[0].id);
    expect(restored[0].id).toBe(first.environment.id);
    expect(client.startThread).toHaveBeenCalledTimes(1);
    expect(await cache.listProjects()).toEqual([]);
  });

  it("should list and archive cached personal chats without connecting sources", async () => {
    const created = await handler.createDiscussion("source", draftId);
    clients.ensureClient.mockClear();

    expect(await handler.listDiscussions()).toMatchObject([{ environment: { id: created.environment.id },
      threads: [{ id: "native-personal", discussionEnvironmentId: created.environment.id }] }]);
    await cache.updateThreadArchiveState("native-personal", true);
    expect(await handler.listDiscussions()).toEqual([]);
    expect(await handler.listDiscussions(true)).toMatchObject([{ threads: [{ id: "native-personal", isArchived: true }] }]);
    expect(clients.ensureClient).not.toHaveBeenCalled();
  });

  it("should retain uncertain creation and refuse to silently start a duplicate conversation", async () => {
    client.startThread.mockRejectedValue(new Error("transport disconnected after dispatch"));

    await expect(handler.createDiscussion("source", draftId)).rejects.toThrow("transport disconnected");
    await expect(handler.createDiscussion("source", draftId)).rejects.toThrow("creation is unresolved");

    expect(client.startThread).toHaveBeenCalledTimes(1);
    expect(await cache.listProjects()).toEqual([]);
    const environment = (await cache.listDiscussionEnvironments())[0];
    const workspace = (await cache.workspaces.list(environment.id))[0];
    expect(await cache.workspaces.listReservations(workspace.id)).toMatchObject([{ state: "uncertain", threadId: null }]);
    expect(await handler.listDiscussions()).toMatchObject([{ environment: { id: environment.id }, threads: [],
      pendingCreation: { clientDraftId: draftId } }]);
  });

  it("should let users abandon a failed setup without deleting files or native history", async () => {
    client.startThread.mockRejectedValue(new Error("reply lost"));
    await expect(handler.createDiscussion("source", draftId)).rejects.toThrow("reply lost");
    const environment = (await cache.listDiscussionEnvironments())[0];
    clients.ensureClient.mockClear();

    await handler.cancelDiscussionCreation(environment.id, "source");

    expect(await handler.listDiscussions()).toEqual([]);
    expect(clients.ensureClient).not.toHaveBeenCalled();
    await expect(handler.createDiscussion("source", draftId)).rejects.toThrow("cancelled");
    expect(client.startThread).toHaveBeenCalledTimes(1);
  });

  it("should never recreate a confirmed conversation after it was explicitly deleted", async () => {
    await handler.createDiscussion("source", draftId);
    await cache.deleteThread("native-personal");

    expect(await handler.listDiscussions()).toEqual([]);
    await expect(handler.createDiscussion("source", draftId)).rejects.toThrow("removed or archived");
    expect(client.startThread).toHaveBeenCalledTimes(1);
  });

  it("should reject invalid draft tokens and relative source homes before directory creation", async () => {
    await expect(handler.createDiscussion("source", "../../project")).rejects.toThrow("valid local draft identifier");
    expect(clients.ensureClient).not.toHaveBeenCalled();
    client.getCodexHome.mockResolvedValue("relative-home");

    await expect(handler.createDiscussion("source", draftId)).rejects.toThrow("relative home");
    expect(client.createDirectory).not.toHaveBeenCalled();
    expect(client.startThread).not.toHaveBeenCalled();
  });

  it("should recover a lost reply on explicit retry only after verifying the native identity and idle directory", async () => {
    client.startThread.mockRejectedValue(new Error("reply lost"));
    await expect(handler.createDiscussion("source", draftId)).rejects.toThrow("reply lost");
    const environment = (await cache.listDiscussionEnvironments())[0];
    const native = { id: "recovered-thread", cwd: environment.path, createdAt: 1, updatedAt: 1,
      source: "appServer", preview: "", status: { type: "idle" } };
    client.listThreads.mockResolvedValue({ data: [native], nextCursor: null });
    client.readThread.mockResolvedValue({ thread: native });

    const recovered = await handler.createDiscussion("source", draftId);

    expect(recovered.threads[0]).toMatchObject({ id: "recovered-thread", discussionEnvironmentId: environment.id });
    const workspace = await cache.workspaces.getForThread("recovered-thread");
    expect(await cache.workspaces.listReservations(workspace!.id)).toEqual([]);
    expect(client.startThread).toHaveBeenCalledTimes(1);
    expect(client.listThreads).toHaveBeenCalledWith(expect.objectContaining({ cwd: environment.path, limit: 2 }));
  });

  it("should retain recovery guards when the source still reports an active chat", async () => {
    client.startThread.mockRejectedValue(new Error("reply lost"));
    await expect(handler.createDiscussion("source", draftId)).rejects.toThrow("reply lost");
    const environment = (await cache.listDiscussionEnvironments())[0];
    const native = { id: "active-thread", cwd: environment.path, createdAt: 1, updatedAt: 1,
      source: "appServer", preview: "", status: { type: "active", activeFlags: [] } };
    client.listThreads.mockResolvedValue({ data: [native], nextCursor: null });
    client.readThread.mockResolvedValue({ thread: native });

    await expect(handler.createDiscussion("source", draftId)).rejects.toThrow("creation is unresolved");

    const workspace = (await cache.workspaces.list(environment.id))[0];
    expect(await cache.workspaces.listReservations(workspace.id)).toMatchObject([{ state: "uncertain", threadId: null }]);
    expect(client.startThread).toHaveBeenCalledTimes(1);
  });
});
