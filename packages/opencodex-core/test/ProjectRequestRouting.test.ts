import { requestRoutingRuntime } from "./requestRoutingFixture";
import type { OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it, vi } from "vitest";

import { isProjectRequest, type ProjectRequest } from "../src/backend/projects/projectRequestRouting.js";
import type { OpenCodexBackendRuntime } from "../src/OpenCodexBackendRuntime.js";
import { OpenCodexRequestRouter } from "../src/OpenCodexRequestRouter.js";

/** Request-to-facade contracts, including argument order and nullable identities. */
interface RouteCase {
  request: ProjectRequest;
  effect: string;
  args: unknown[];
}

const creationInput = {
  projectId: "project", sourceId: "source", destinationPath: "/remote/new",
  start: { mode: "detached" as const, startPoint: "HEAD" }
};
const preferences = {};
const groupPatch = { name: "Renamed", isCollapsed: true };
const workStatusInput = { projectId: "project", workspaceId: "workspace", sourceId: "source", workspacePath: "/workspace",
  workStatus: "completed" as const, expectedWorkStatus: "active" as const, expectedCompletedAt: null };
const cases: RouteCase[] = [
  { request: { type: "projectWorkspaces.workStatus.update", input: workStatusInput },
    effect: "workspaces.setWorkStatus", args: [workStatusInput] },
  { request: { type: "projectWorkspaces.lock.read", projectId: "project", workspaceId: "workspace", sourceId: "source" },
    effect: "workspaceLocks.read", args: ["project", "workspace", "source"] },
  { request: { type: "projectWorkspaces.lock.update", input: { projectId: "project", workspaceId: "workspace", sourceId: "source",
    workspacePath: "/workspace", locked: true, expectedReason: null, reason: "Keep" } }, effect: "workspaceLocks.update",
    args: [{ projectId: "project", workspaceId: "workspace", sourceId: "source", workspacePath: "/workspace", locked: true,
      expectedReason: null, reason: "Keep" }] },
  { request: { type: "projectWorkspaces.move", input: { projectId: "project", workspaceId: "workspace", sourceId: "source", rootId: "root" } },
    effect: "workspaceMoves.move", args: [{ projectId: "project", workspaceId: "workspace", sourceId: "source", rootId: "root" }] },
  { request: { type: "projectWorkspaces.moves.list", projectId: "project" }, effect: "workspaceMoves.pending", args: ["project"] },
  { request: { type: "projectWorkspaces.moves.reconcile", moveId: "move" }, effect: "workspaceMoves.reconcile", args: ["move"] },
  { request: { type: "projectWorkspaces.relocate", projectId: "project", workspaceId: "workspace", sourceId: "source",
    destinationPath: "/moved", confirmIdentity: true }, effect: "workspaceRelocations.relocate",
    args: ["project", "workspace", "source", "/moved", true] },
  { request: { type: "projectWorkspaces.remove", projectId: "project", workspaceId: "workspace", sourceId: "source" },
    effect: "workspaceRemovals.remove", args: ["project", "workspace", "source"] },
  { request: { type: "projectWorkspaces.removals.list", projectId: "project" },
    effect: "workspaceRemovals.pending", args: ["project"] },
  { request: { type: "projectWorkspaces.removals.reconcile", removalId: "removal" },
    effect: "workspaceRemovals.reconcile", args: ["removal"] },
  { request: { type: "projects.list" }, effect: "projects.list", args: [] },
  { request: { type: "projectWorkspaces.discover", projectId: "project", sourceId: "source" },
    effect: "workspaces.discover", args: ["project", "source"] },
  { request: { type: "projectWorkspaces.create", input: creationInput }, effect: "workspaces.create", args: [creationInput] },
  { request: { type: "projectWorkspaces.creations.list", projectId: "project" },
    effect: "workspaces.pendingCreations", args: ["project"] },
  { request: { type: "projectWorkspaces.creations.reconcile", creationId: "creation" },
    effect: "workspaces.reconcileCreation", args: ["creation"] },
  { request: { type: "projectWorkspaces.rename", projectId: "project", workspaceId: "workspace", name: "Feature" },
    effect: "workspaces.rename", args: ["project", "workspace", "Feature"] },
  { request: { type: "projectWorkspaces.list", projectId: "project" }, effect: "workspaces.list", args: ["project"] },
  { request: { type: "projectWorkspaces.activity", projectId: "project" }, effect: "workspaces.activity", args: ["project"] },
  { request: { type: "projectWorkspaces.execution.reconcile", workspaceId: "workspace" },
    effect: "workspaces.reconcileWorkspace", args: ["workspace"] },
  { request: { type: "threads.workspace.select", threadId: "thread", workspaceId: "workspace" },
    effect: "workspaces.select", args: ["thread", "workspace"] },
  { request: { type: "threads.workspace.reconcile", threadId: "thread" }, effect: "workspaces.reconcile", args: ["thread"] },
  { request: { type: "projects.open", projectPath: "/remote/project", sourceId: "source", createIfMissing: true },
    effect: "projects.open", args: ["/remote/project", "source", true] },
  { request: { type: "projects.statistics.read", projectPath: "/remote/project", sourceId: null },
    effect: "projects.readStatistics", args: ["/remote/project", null] },
  { request: { type: "projects.pickDirectory", mode: "create", sourceId: "source" },
    effect: "projects.pickDirectory", args: ["create", "source"] },
  { request: { type: "projects.setHidden", projectId: "project", isHidden: true },
    effect: "projects.setHidden", args: ["project", true] },
  { request: { type: "projects.displayName.update", projectId: "project", displayName: null },
    effect: "projects.setDisplayName", args: ["project", null] },
  { request: { type: "projects.preferences.update", projectId: "project", patch: preferences },
    effect: "projects.updatePreferences", args: ["project", preferences] },
  { request: { type: "projects.context.sync", projectId: "project" }, effect: "context.sync", args: ["project"] },
  { request: { type: "projects.context.pickFolder" }, effect: "context.pickFolder", args: [] },
  { request: { type: "projects.delete", projectId: "project" }, effect: "projects.delete", args: ["project"] },
  { request: { type: "projectGroups.list" }, effect: "groups.list", args: [] },
  { request: { type: "projectGroups.create", name: "Group" }, effect: "groups.create", args: ["Group", null, "blue"] },
  { request: { type: "projectGroups.update", groupId: "group", patch: groupPatch },
    effect: "groups.update", args: ["group", groupPatch] },
  { request: { type: "projectGroups.delete", groupId: "group" }, effect: "groups.delete", args: ["group"] },
  { request: { type: "projectGroups.assignProject", projectId: "project", groupId: null },
    effect: "groups.assignProject", args: ["project", null] }
];

/** Builds only the effect facades consumed by routing, leaving the real dispatcher and error boundary intact. */
function createProjectRoutingFixture() {
  const response = { fixture: "response" };
  const ports = {
    workspaceLocks: { read: vi.fn(), update: vi.fn() },
    workspaceMoves: { move: vi.fn(), pending: vi.fn(), reconcile: vi.fn() },
    workspaceRelocations: { relocate: vi.fn() },
    workspaceRemovals: { remove: vi.fn(), pending: vi.fn(), reconcile: vi.fn() },
    projects: {
      list: vi.fn(), open: vi.fn(), readStatistics: vi.fn(), pickDirectory: vi.fn(),
      setHidden: vi.fn(), setDisplayName: vi.fn(), updatePreferences: vi.fn(), delete: vi.fn()
    },
    workspaces: {
      discover: vi.fn(), create: vi.fn(), pendingCreations: vi.fn(), reconcileCreation: vi.fn(),
      rename: vi.fn(), setWorkStatus: vi.fn(), list: vi.fn(), activity: vi.fn(), reconcileWorkspace: vi.fn(), select: vi.fn(), reconcile: vi.fn()
    },
    groups: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), assignProject: vi.fn() },
    context: { sync: vi.fn(), pickFolder: vi.fn() }
  };
  const effects: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const [domain, methods] of Object.entries(ports)) {
    for (const [method, effect] of Object.entries(methods)) {
      effect.mockResolvedValue(response);
      effects[`${domain}.${method}`] = effect;
    }
  }
  const settings = { get: vi.fn(() => ({ defaultSourceId: "default-source" })) };
  const resolveToolRequest = vi.fn(async (request: OpenCodexRequest) => request);
  const handleRequestError = vi.fn();
  const prepareWorkspace = vi.fn(async (_input: unknown) => response);
  const runtime = { ...ports, settings, resolveToolRequest, handleRequestError,
    automation: { commands: { prepareWorkspace } } } as unknown as OpenCodexBackendRuntime;
  return { router: new OpenCodexRequestRouter(requestRoutingRuntime(runtime)), ports, effects, settings, resolveToolRequest, handleRequestError, response, prepareWorkspace };
}

describe("project request routing through the shared router", () => {
  it("should route preparation to command execution and propagate rejection to its dialog", async () => {
    const fixture = createProjectRoutingFixture();
    const input = { projectId: "project", workspaceId: "workspace", sourceId: "source", workspacePath: "/secondary",
      command: { id: "command", name: "Prepare", command: "npm ci", executionMode: "workspace" as const,
        persistLogs: false, updatedAt: "2026-10-22" } };
    expect(await fixture.router.handleRequest({ type: "projectWorkspaces.prepare", input })).toBe(fixture.response);
    expect(fixture.prepareWorkspace).toHaveBeenCalledWith(input);
    fixture.prepareWorkspace.mockRejectedValueOnce(new Error("Trust the project"));
    await expect(fixture.router.handleRequest({ type: "projectWorkspaces.prepare", input })).rejects.toThrow("Trust the project");
    expect(fixture.handleRequestError).not.toHaveBeenCalled();
  });
  it.each(cases)("should forward $request.type to $effect with its contracted arguments", async ({ request, effect, args }) => {
    const fixture = createProjectRoutingFixture();

    expect(isProjectRequest(request)).toBe(true);
    expect(await fixture.router.handleRequest(request)).toBe(fixture.response);
    expect(fixture.effects[effect]).toHaveBeenCalledWith(...args);
    expect(Object.values(fixture.effects).reduce((count, mock) => count + mock.mock.calls.length, 0)).toBe(1);
    expect(fixture.resolveToolRequest).not.toHaveBeenCalled();
    expect(fixture.handleRequestError).not.toHaveBeenCalled();
  });

  it.each([undefined, null, "explicit-source"])("should preserve the source selection %s for opening and picking projects", async (sourceId) => {
    const fixture = createProjectRoutingFixture();
    const expectedSource = sourceId === undefined ? "default-source" : sourceId;

    await fixture.router.handleRequest({ type: "projects.open", projectPath: "C:\\project", sourceId });
    await fixture.router.handleRequest({ type: "projects.pickDirectory", mode: "open", sourceId });

    expect(fixture.ports.projects.open).toHaveBeenCalledWith("C:\\project", expectedSource, false);
    expect(fixture.ports.projects.pickDirectory).toHaveBeenCalledWith("open", expectedSource);
    expect(fixture.settings.get).toHaveBeenCalledTimes(sourceId === undefined ? 2 : 0);
  });

  it("should read the current default source at request time", async () => {
    const fixture = createProjectRoutingFixture();
    await fixture.router.handleRequest({ type: "projects.open", projectPath: "/project" });
    fixture.settings.get.mockReturnValue({ defaultSourceId: "new-default" });

    await fixture.router.handleRequest({ type: "projects.open", projectPath: "/project", createIfMissing: false });

    expect(fixture.ports.projects.open.mock.calls).toEqual([
      ["/project", "default-source", false], ["/project", "new-default", false]
    ]);
  });

  it("should retain explicit group parent and color values", async () => {
    const fixture = createProjectRoutingFixture();

    await fixture.router.handleRequest({ type: "projectGroups.create", name: "Group", parentGroupId: "parent", color: "red" });

    expect(fixture.ports.groups.create).toHaveBeenCalledWith("Group", "parent", "red");
  });

  it("should await shared workspace resolution and dispatch the resolved context once", async () => {
    const fixture = createProjectRoutingFixture();
    const original: OpenCodexRequest = { type: "projects.context.sync", projectId: "project", workspaceId: "workspace" };
    const resolved: OpenCodexRequest = { type: "projects.context.sync", projectId: "resolved-project", workspaceId: "resolved-workspace" };
    let finish!: (request: OpenCodexRequest) => void;
    fixture.resolveToolRequest.mockReturnValue(new Promise((resolve) => { finish = resolve; }));

    const pending = fixture.router.handleRequest(original);
    expect(fixture.resolveToolRequest).toHaveBeenCalledWith(original);
    expect(fixture.ports.context.sync).not.toHaveBeenCalled();
    finish(resolved);

    expect(await pending).toBe(fixture.response);
    expect(fixture.ports.context.sync).toHaveBeenCalledTimes(1);
    expect(fixture.ports.context.sync).toHaveBeenCalledWith("resolved-project", "resolved-workspace");
  });

  it("should retain an undefined response from a workspace operation without a second dispatch", async () => {
    const fixture = createProjectRoutingFixture();
    fixture.ports.workspaces.select.mockResolvedValue(undefined);

    expect(await fixture.router.handleRequest({ type: "threads.workspace.select", threadId: "thread", workspaceId: "workspace" }))
      .toBeUndefined();
    expect(fixture.ports.workspaces.select).toHaveBeenCalledTimes(1);
    expect(fixture.resolveToolRequest).not.toHaveBeenCalled();
    expect(fixture.handleRequestError).not.toHaveBeenCalled();
  });

  it("should report failed workspace resolution against the original request without invoking the facade", async () => {
    const fixture = createProjectRoutingFixture();
    const request: OpenCodexRequest = { type: "projects.context.sync", projectId: "project", workspaceId: "workspace" };
    const error = new Error("Source does not own this workspace");
    fixture.resolveToolRequest.mockRejectedValue(error);

    expect(await fixture.router.handleRequest(request)).toBeUndefined();
    expect(fixture.ports.context.sync).not.toHaveBeenCalled();
    expect(fixture.handleRequestError).toHaveBeenCalledTimes(1);
    expect(fixture.handleRequestError).toHaveBeenCalledWith(request, error);
  });

  it.each(["synchronous", "asynchronous"])("should keep %s facade errors inside the shared error boundary", async (failure) => {
    const fixture = createProjectRoutingFixture();
    const request: OpenCodexRequest = { type: "projects.delete", projectId: "project" };
    const error = new Error("Delete failed");
    if (failure === "synchronous") {
      fixture.ports.projects.delete.mockImplementation(() => { throw error; });
    } else {
      fixture.ports.projects.delete.mockRejectedValue(error);
    }

    expect(await fixture.router.handleRequest(request)).toBeUndefined();
    expect(fixture.handleRequestError).toHaveBeenCalledTimes(1);
    expect(fixture.handleRequestError).toHaveBeenCalledWith(request, error);
  });

  it("should retain the original request when a resolved facade rejects", async () => {
    const fixture = createProjectRoutingFixture();
    const original: OpenCodexRequest = { type: "projects.context.sync", projectId: "project", workspaceId: "workspace" };
    fixture.resolveToolRequest.mockResolvedValue({ ...original, workspaceId: "resolved" });
    const error = new Error("Sync failed");
    fixture.ports.context.sync.mockRejectedValue(error);

    expect(await fixture.router.handleRequest(original)).toBeUndefined();
    expect(fixture.handleRequestError).toHaveBeenCalledWith(original, error);
  });

  it("should keep unrelated domains in the main router", () => {
    const requests: OpenCodexRequest[] = [
      { type: "threads.list", scope: "all" },
      { type: "projectGoals.list", projectId: "project" },
      { type: "settings.get" },
      { type: "git.status", projectPath: "/project", sourceId: "source" }
    ];

    for (const request of requests) {
      expect(isProjectRequest(request)).toBe(false);
    }
  });
});
