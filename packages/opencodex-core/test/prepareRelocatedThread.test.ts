import { describe, expect, it, vi } from "vitest";
import type { OpenCodexCacheRepository, WorkspaceExecutionReservation } from "@open-codex-ui/opencodex-cache";
import type { ClientPort } from "../src/backend/runtime/runtimePorts";
import { prepareRelocatedThread } from "../src/backend/workspaces/prepareRelocatedThread";

const reservation: WorkspaceExecutionReservation = { id: "reservation", threadId: "thread", turnId: null,
  projectId: "project", workspaceId: "workspace", sourceId: "source", cwd: "/new", state: "preparing", operation: "turn" };

/** Keeps policy construction and response verification real, isolating source IO only. */
function fixture(customProfile = false, mismatch = false) {
  const initial = { thread: { id: "thread", status: { type: "idle" }, canAcceptDirectInput: true, cwd: "/old" },
    cwd: "/old", runtimeWorkspaceRoots: ["/old"],
    activePermissionProfile: { id: customProfile ? "custom" : "opencodex-workspace-old", extends: ":workspace" },
    sandbox: { type: "workspaceWrite", networkAccess: false, excludeTmpdirEnvVar: true, excludeSlashTmp: true, writableRoots: [] },
    approvalPolicy: "on-request", approvalsReviewer: "user" };
  const client = {
    request: vi.fn(async () => ({ data: [], nextCursor: null })),
    getMetadata: vi.fn(async () => ({ isDirectory: true, isSymlink: false })),
    readThread: vi.fn(async () => ({ thread: initial.thread })),
    unsubscribeThread: vi.fn(async () => ({ status: "unsubscribed" })),
    resumeThread: vi.fn(async (_id: string, params: Record<string, unknown>) => {
      if (params.permissions === undefined) return initial;
      return { ...initial, cwd: mismatch ? "/old" : params.cwd, runtimeWorkspaceRoots: params.runtimeWorkspaceRoots,
        activePermissionProfile: { id: params.permissions, extends: ":workspace" } };
    })
  };
  const repository = { workspaces: { listReservations: vi.fn(async () => [reservation]) },
    listProjects: vi.fn(async () => [{ id: "project", sourceId: "source", preferences: {} }]) } as unknown as OpenCodexCacheRepository;
  const clients = { ensureClient: vi.fn(async () => client) } as unknown as Pick<ClientPort, "ensureClient">;
  const write = vi.fn(async () => undefined);
  return { client, repository, clients, write };
}

describe("relocated conversation permission preparation", () => {
  it("should resume with only the new managed root and preserve the source's approval contract", async () => {
    const { client, repository, clients, write } = fixture();
    await prepareRelocatedThread(repository, clients, reservation, "/old", write);
    expect(write).toHaveBeenCalledWith(client, expect.objectContaining({ projectPath: "/new", networkAccess: false }));
    expect(client.resumeThread).toHaveBeenLastCalledWith("thread", expect.objectContaining({ cwd: "/new",
      runtimeWorkspaceRoots: ["/new"], approvalPolicy: "on-request", approvalsReviewer: "user",
      permissions: expect.stringMatching(/^opencodex-workspace-/u) }));
    const params = client.resumeThread.mock.calls.at(-1)![1];
    expect(JSON.stringify(params)).not.toContain('"/old"');
  });

  it("should refuse custom policies without overwriting their configuration", async () => {
    const { repository, clients, write } = fixture(true);
    await expect(prepareRelocatedThread(repository, clients, reservation, "/old", write)).rejects.toThrow("custom");
    expect(write).not.toHaveBeenCalled();
  });

  it("should reject a resume that retained the old directory before any turn can be sent", async () => {
    const { repository, clients, write } = fixture(false, true);
    await expect(prepareRelocatedThread(repository, clients, reservation, "/old", write)).rejects.toThrow("destination directory");
  });
});
