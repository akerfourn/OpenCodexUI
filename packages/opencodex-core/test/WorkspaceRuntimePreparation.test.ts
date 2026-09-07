import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type { OpenCodexCacheRepository, WorkspaceTransitionRecord } from "@open-codex-ui/opencodex-cache";
import { WorkspaceRuntimePreparation } from "../src/backend/workspaces/WorkspaceRuntimePreparation";
import { workspacePermissionInput } from "../src/backend/workspaces/workspacePermissionProfile";
import { buildManagedPermissionProfile } from "../src/backend/projects/projectContextConfig";

const transition: WorkspaceTransitionRecord = {
  id: "transition", threadId: "thread", projectId: "project", sourceId: "source",
  fromWorkspaceId: "A", toWorkspaceId: "B", fromPath: "/repo/A", toPath: "/repo/B",
  state: "preparing", expectationJson: null
};

/** Source effects are mocked; policy generation and production preparation remain real. */
function fixture() {
  const thread = { id: "thread", status: { type: "idle" }, canAcceptDirectInput: true, source: "cli" };
  const profileInput = workspacePermissionInput(transition, []);
  const client = {
    request: vi.fn(async (method: string) => {
      if (method === "thread/loaded/list") return { data: ["thread"], nextCursor: null };
      return { config: { default_permissions: profileInput.profileId,
        permissions: { [profileInput.profileId]: buildManagedPermissionProfile(profileInput) } } };
    }),
    readThread: vi.fn(async () => ({ thread })),
    resumeThread: vi.fn(async () => ({ thread, cwd: "/repo/A", sandbox: { type: "workspaceWrite" },
      activePermissionProfile: { id: ":workspace" }, approvalPolicy: "on-request", approvalsReviewer: "user" })),
    getMetadata: vi.fn(async () => ({ isDirectory: true, isSymlink: false })),
    createDirectory: vi.fn(), readFile: vi.fn(async () => ({ dataBase64: "" })), writeFile: vi.fn()
  };
  const cache = {
    listProjects: vi.fn(async () => [{ id: "project", sourceId: "source", preferences: {} }]),
    workspaces: { listReservations: vi.fn(async () => [{ id: "new", workspaceId: "B", projectId: "project",
      sourceId: "source", cwd: "/repo/B", threadId: null, state: "preparing" }]), transitions: { getForThread: vi.fn(async () => transition) } }
  } as unknown as OpenCodexCacheRepository;
  const clients = { ensureClient: vi.fn(async () => client as unknown as CodexAppServerClient) };
  return { service: new WorkspaceRuntimePreparation(cache, clients), client, clients };
}

describe("production workspace preparation", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("should prepare a new conversation without reading or resuming a nonexistent rollout", async () => {
    const { service, client } = fixture();
    const parameters = await service.prepareCreation({ id: "new", workspaceId: "B", projectId: "project",
      sourceId: "source", cwd: "/repo/B", threadId: null, state: "preparing", operation: "turn", turnId: null },
    { id: "A", projectId: "project", sourceId: "source", path: "/repo/A", isPrimary: true,
      managed: false, removedAt: null });
    expect(parameters.runtimeWorkspaceRoots).toEqual(["/repo/B"]);
    expect(parameters.permissions).toMatch(/^opencodex-workspace-/u);
    expect(parameters.approvalPolicy).toBeUndefined();
    expect(client.resumeThread).not.toHaveBeenCalled();
    expect(client.readThread).not.toHaveBeenCalled();
  });

  it("should not replace an explicit read-only default while creating a workspace conversation", async () => {
    const { service, client } = fixture();
    client.request.mockResolvedValue({ config: { default_permissions: ":read-only" } } as never);
    await expect(service.prepareCreation({ id: "new", workspaceId: "B", projectId: "project",
      sourceId: "source", cwd: "/repo/B", threadId: null, state: "preparing", operation: "turn", turnId: null },
    { id: "A", projectId: "project", sourceId: "source", path: "/repo/A", isPrimary: true,
      managed: false, removedAt: null })).rejects.toThrow("read-only source policy");
    expect(client.writeFile).not.toHaveBeenCalled();
  });

  it("should preserve actual thread approvals and check every source ancestor", async () => {
    const { service, client, clients } = fixture();
    await service.requireSupported(transition);
    const result = await service.prepare(transition);
    expect(result.approvalPolicy).toBe("on-request");
    expect(result.approvalsReviewer).toBe("user");
    expect(result.cwd).toBe("/repo/B");
    expect(client.getMetadata).toHaveBeenCalledWith("/repo");
    expect(client.getMetadata).toHaveBeenCalledWith("/");
    expect(clients.ensureClient).toHaveBeenCalledWith("source");
    expect(client.writeFile).toHaveBeenCalledWith("/repo/B/.codex/config.toml", expect.any(String));
  });

  it("should refuse an active source session before writing configuration", async () => {
    const { service, client } = fixture();
    client.readThread.mockResolvedValue({ thread: {
      id: "thread", status: { type: "active" }, canAcceptDirectInput: true, source: "cli"
    } });
    await expect(service.requireSupported(transition)).rejects.toThrow("Finish active");
    expect(client.writeFile).not.toHaveBeenCalled();
  });

  it("should refuse an alias in a source-local ancestor", async () => {
    const { service, client } = fixture();
    client.getMetadata.mockImplementation(async (value?: string) => ({
      isDirectory: true, isSymlink: value === "/repo"
    }));
    await expect(service.requireSupported(transition)).rejects.toThrow("symbolic-link ancestors");
    expect(client.writeFile).not.toHaveBeenCalled();
  });

  it("should preserve an incompatible user policy by refusing its replacement", async () => {
    const { service, client } = fixture();
    const original = await client.resumeThread();
    client.resumeThread.mockResolvedValue({ ...original, activePermissionProfile: { id: "custom-user-policy" } });
    await expect(service.prepare(transition)).rejects.toThrow("not replaced");
    expect(client.writeFile).not.toHaveBeenCalled();
  });

  it("should refuse incomplete loaded-session inventory", async () => {
    const { service, client } = fixture();
    client.request.mockResolvedValue({ data: [], nextCursor: "more" } as never);
    await expect(service.requireSupported(transition)).rejects.toThrow("incomplete");
  });
});
