import { requestRoutingRuntime } from "./requestRoutingFixture";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createOpenCodexSqliteCacheRepository, type OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { CodexAppServerClient, v2 } from "@open-codex-ui/codex-rpc";
import type { ThreadPermissionsPatch } from "@open-codex-ui/opencodex-protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThreadPermissionsService } from "../src/backend/threads/ThreadPermissionsService";
import { WorkspaceExecutionService } from "../src/backend/workspaces/WorkspaceExecutionService";
import { OpenCodexRequestRouter } from "../src/OpenCodexRequestRouter";
import type { OpenCodexBackendRuntime } from "../src/OpenCodexBackendRuntime";

const context = { threadId: "thread-a", sourceId: "source-a" };
const selected: ThreadPermissionsPatch = { filesystem: "workspace-write", networkAccess: true, approvalsReviewer: "auto_review" };

describe("effective conversation permissions", () => {
  let directory: string;
  let cache: OpenCodexCacheRepository;
  let execution: WorkspaceExecutionService;
  let service: ThreadPermissionsService;
  let workspaceId: string;
  let current: v2.ThreadResumeResponse;
  let configuredProfile: string | null;
  let liveStatus: string;
  let applyUpdates: boolean;
  const client = { request: vi.fn(), resumeThread: vi.fn(), readThread: vi.fn(), getMetadata: vi.fn() };
  const clients = { ensureClient: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "opencodex-permissions-test-"));
    cache = createOpenCodexSqliteCacheRepository({ directory });
    await cache.upsertThreadIndex([{
      id: "thread-a", sessionId: null, parentThreadId: null, sourceId: "source-a",
      projectPath: "/source/repo", projectName: "repo", title: "Thread", codexTitle: "Thread",
      customTitle: null, preview: "", model: null, reasoningEffort: null,
      branchName: null, updatedAt: null, isArchived: false, threadSource: null,
      agentNickname: null, agentRole: null, subAgentSource: null, canAcceptDirectInput: true
    }]);
    workspaceId = (await cache.workspaces.getForThread("thread-a"))!.id;
    current = { thread: { id: "thread-a", status: { type: "idle" }, canAcceptDirectInput: true },
      cwd: "/source/repo", sandbox: { type: "readOnly", networkAccess: false },
      approvalPolicy: "on-request", approvalsReviewer: "user", activePermissionProfile: { id: ":read-only", extends: null }
    } as v2.ThreadResumeResponse;
    configuredProfile = null;
    liveStatus = "idle";
    applyUpdates = true;
    client.readThread.mockImplementation(async () => ({ thread: { id: "thread-a", status: { type: liveStatus } } }));
    client.resumeThread.mockImplementation(async () => structuredClone(current));
    client.request.mockImplementation(async (method: string, params: v2.ThreadSettingsUpdateParams) => {
      if (method === "config/read") return { config: { default_permissions: configuredProfile } };
      if (method !== "thread/settings/update") throw new Error(`Unexpected RPC: ${method}`);
      if (applyUpdates) {
        if (params.sandboxPolicy !== undefined && params.sandboxPolicy !== null) {
          current.sandbox = structuredClone(params.sandboxPolicy);
          current.activePermissionProfile = null;
        }
        if (params.approvalsReviewer !== undefined && params.approvalsReviewer !== null) {
          current.approvalsReviewer = params.approvalsReviewer;
        }
      }
      return {};
    });
    clients.ensureClient.mockResolvedValue(client as unknown as CodexAppServerClient);
    execution = new WorkspaceExecutionService(cache.workspaces, clients);
    service = new ThreadPermissionsService(clients, execution);
  });

  afterEach(async () => {
    await cache.close();
    const target = path.resolve(directory);
    if (path.dirname(target) !== path.resolve(os.tmpdir()) || !path.basename(target).startsWith("opencodex-permissions-test-")) {
      throw new Error("Unexpected test cleanup path");
    }
    fs.rmSync(target, { recursive: true, force: true });
  });

  /** Reads through the real service and shared workspace guard. */
  async function read() { return await service.execute({ type: "threadPermissions.read", context }); }

  it("should report the source's actual read-only settings instead of global defaults", async () => {
    const snapshot = await read();

    expect(snapshot).toMatchObject({ ...context, cwd: "/source/repo", profileId: ":read-only",
      filesystem: "read-only", networkAccess: false, approvalsReviewer: "user", canChangeAccess: true });
    expect(clients.ensureClient).toHaveBeenCalledWith("source-a");
    expect(client.resumeThread).toHaveBeenCalledWith("thread-a", { excludeTurns: true });
    expect(client.request).not.toHaveBeenCalledWith("thread/settings/update", expect.anything());
    expect(await cache.workspaces.listReservations(workspaceId)).toEqual([]);
  });

  it("should restore scoped workspace access on the same chat and confirm the native result", async () => {
    const before = await read();

    const result = await service.execute({ type: "threadPermissions.change", context, revision: before.revision, patch: selected });

    expect(client.request).toHaveBeenCalledWith("thread/settings/update", {
      threadId: "thread-a", approvalsReviewer: "auto_review", sandboxPolicy: {
        type: "workspaceWrite", writableRoots: [], networkAccess: true,
        excludeTmpdirEnvVar: true, excludeSlashTmp: true
      }
    });
    expect(result).toMatchObject({ ...context, filesystem: "workspace-write", networkAccess: true, approvalsReviewer: "auto_review" });
    expect(result.revision).not.toBe(before.revision);
    expect(current.approvalPolicy).toBe("on-request");
    expect((await cache.getThread("thread-a"))?.thread.id).toBe("thread-a");
    expect(await cache.workspaces.listReservations(workspaceId)).toEqual([]);
  });

  it("should preserve additional writable roots and temporary-directory restrictions on a network-only change", async () => {
    current.sandbox = { type: "workspaceWrite", writableRoots: ["/source/shared"], networkAccess: false,
      excludeTmpdirEnvVar: false, excludeSlashTmp: true };
    current.activePermissionProfile = null;
    const snapshot = await read();

    await service.execute({ type: "threadPermissions.change", context, revision: snapshot.revision,
      patch: { approvalsReviewer: "user", networkAccess: true } });

    expect(current.sandbox).toEqual({ type: "workspaceWrite", writableRoots: ["/source/shared"], networkAccess: true,
      excludeTmpdirEnvVar: false, excludeSlashTmp: true });
  });

  it("should allow reviewer-only changes while preserving a custom managed profile", async () => {
    configuredProfile = "opencodex-context";
    current.activePermissionProfile = { id: "opencodex-context", extends: ":workspace" };
    const snapshot = await read();
    expect(snapshot.canChangeAccess).toBe(false);

    await service.execute({ type: "threadPermissions.change", context, revision: snapshot.revision,
      patch: { approvalsReviewer: "auto_review" } });

    expect(client.request).toHaveBeenCalledWith("thread/settings/update", { threadId: "thread-a", approvalsReviewer: "auto_review" });
    expect(current.activePermissionProfile?.id).toBe("opencodex-context");
  });

  it("should refuse replacing a configured custom profile even when the current mode is read-only", async () => {
    configuredProfile = "restricted-project";
    const snapshot = await read();

    await expect(service.execute({ type: "threadPermissions.change", context, revision: snapshot.revision, patch: selected }))
      .rejects.toThrow("protected or custom access profile");
    expect(client.request).not.toHaveBeenCalledWith("thread/settings/update", expect.anything());
  });

  it("should reject stale revisions before changing permissions", async () => {
    const snapshot = await read();
    current.approvalsReviewer = "auto_review";

    await expect(service.execute({ type: "threadPermissions.change", context, revision: snapshot.revision, patch: selected }))
      .rejects.toThrow("changed. Refresh");
    expect(client.request).not.toHaveBeenCalledWith("thread/settings/update", expect.anything());
  });

  it("should refuse a different source before contacting any client", async () => {
    await expect(service.execute({ type: "threadPermissions.read", context: { ...context, sourceId: "other-source" } }))
      .rejects.toThrow("does not own");
    expect(clients.ensureClient).not.toHaveBeenCalled();
  });

  it.each(["active", "systemError", "unknown"])("should refuse a live thread reporting %s", async (status) => {
    liveStatus = status;

    await expect(read()).rejects.toThrow("active or its execution status is unknown");
    expect(client.resumeThread).not.toHaveBeenCalled();
  });

  it("should refuse settings while durable execution recovery is pending", async () => {
    await cache.workspaces.reserve(workspaceId, "thread-a");

    await expect(read()).rejects.toThrow("Reconcile pending workspace operations");
    expect(clients.ensureClient).not.toHaveBeenCalled();
  });

  it.each(["identity", "workspace"])("should reject an unexpected resumed %s", async (kind) => {
    if (kind === "identity") current.thread.id = "other-thread";
    else current.cwd = "/other/path";

    await expect(read()).rejects.toThrow("different conversation or workspace");
    expect(client.request).not.toHaveBeenCalledWith("thread/settings/update", expect.anything());
  });

  it("should reject unsupported access instead of forwarding arbitrary settings", async () => {
    const snapshot = await read();

    await expect(service.execute({ type: "threadPermissions.change", context, revision: snapshot.revision,
      patch: { ...selected, filesystem: "danger-full-access" } as unknown as ThreadPermissionsPatch }))
      .rejects.toThrow("Unsupported conversation permission selection");
    expect(client.request).not.toHaveBeenCalledWith("thread/settings/update", expect.anything());
  });

  it("should not report success when Codex leaves the effective settings unchanged", async () => {
    const snapshot = await read();
    applyUpdates = false;

    await expect(service.execute({ type: "threadPermissions.change", context, revision: snapshot.revision, patch: selected }))
      .rejects.toThrow("did not confirm");
  });

  it("should serialize a pending settings update with local turn starts and release the gate afterward", async () => {
    const snapshot = await read();
    let finish!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const original = client.request.getMockImplementation()!;
    client.request.mockImplementation(async (method, params) => {
      if (method === "thread/settings/update") {
        entered();
        await new Promise<void>((resolve) => { finish = resolve; });
      }
      return await original(method, params);
    });
    const changing = service.execute({ type: "threadPermissions.change", context, revision: snapshot.revision, patch: selected });
    await started;

    await expect(execution.run({ ...context, projectPath: null }, vi.fn())).rejects.toThrow("operation in progress");
    finish();
    await changing;
    await expect(read()).resolves.toMatchObject({ approvalsReviewer: "auto_review" });
  });

  it("should propagate permission errors through the router without triggering chat recovery", async () => {
    const handleRequestError = vi.fn();
    const router = new OpenCodexRequestRouter(requestRoutingRuntime({ threadPermissions: service, handleRequestError } as unknown as OpenCodexBackendRuntime));
    liveStatus = "active";

    await expect(router.handleRequest({ type: "threadPermissions.read", context })).rejects.toThrow("active");
    expect(handleRequestError).not.toHaveBeenCalled();
  });
});
