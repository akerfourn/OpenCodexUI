import { autorun } from "mobx";
import { describe, expect, it, vi } from "vitest";
import type { OpenCodexProject, OpenCodexProjectWorkspace, OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";
import { createThread } from "./chatStore/chatStoreFixtures";
import { RootStore } from "../src/stores/RootStore";

/** Real stores with an isolated transport and stable source-owned checkout identities. */
function fixture() {
  const request = vi.fn(async (input: OpenCodexRequest): Promise<unknown> => {
    if (input.type === "projectWorkspaces.list") return workspaces;
    if (input.type === "projectWorkspaces.creations.list") return [];
    return undefined;
  });
  const root = new RootStore({ request, onEvent: () => () => undefined });
  const project = root.projectsStore.openProjectTab({
    id: "project", path: "/A", sourceId: "source", defaultName: "Project", displayName: null,
    preferences: {}, isHidden: false, createdAt: "", updatedAt: "", editedAt: "", lastSeenAt: ""
  } as OpenCodexProject, false);
  vi.spyOn(root.sourcesStore, "isSourceReady").mockReturnValue(true);
  return { root, project, request };
}
const workspaces: OpenCodexProjectWorkspace[] = [
  { id: "A", projectId: "project", sourceId: "source", path: "/A", isPrimary: true, managed: false, removedAt: null },
  { id: "B", projectId: "project", sourceId: "source", path: "/B", isPrimary: false, managed: true, removedAt: null }
];

describe("workspace UI orchestration", () => {
  it("should offer only this source's storage locations and send an automatic creation intent", async () => {
    const { root, project, request } = fixture();
    root.appStore.settingsStore.settings.workspaceRoots = [
      { id: "storage", sourceId: "source", label: "Storage", path: "/storage", isDefault: true },
      { id: "remote", sourceId: "remote", label: "Remote", path: "/remote", isDefault: true }
    ];
    expect(project.workspaces.storageRoots.map((item) => item.id)).toEqual(["storage"]);
    expect(project.workspaces.storagePreview("storage")).toBe("/storage/project/<workspace-id>");
    await project.workspaces.create(undefined, { mode: "detached", startPoint: "HEAD" }, "Automatic", "storage");
    expect(request).toHaveBeenCalledWith({ type: "projectWorkspaces.create", input: {
      projectId: "project", sourceId: "source", destinationPath: undefined, rootId: "storage",
      name: "Automatic", start: { mode: "detached", startPoint: "HEAD" }
    } });
  });

  it("should preserve the primary default and target a selected checkout for a new conversation", async () => {
    const { project, request } = fixture();
    expect(project.workspacePath).toBe("/A");
    await project.workspaces.load();
    await project.workspaces.select("B");
    project.createThread();
    expect(request).toHaveBeenCalledWith({
      type: "threads.create", projectPath: "/B", sourceId: "source", workspaceId: "B"
    });
    expect(project.projectPath).toBe("/A");
  });

  it("should start a separate conversation in another checkout without switching the current one", async () => {
    const { project, request } = fixture();
    await project.workspaces.load();
    project.threadListStore.createThread("B");
    expect(request).toHaveBeenCalledWith({ type: "threads.create", projectPath: "/B", sourceId: "source", workspaceId: "B" });
    expect(request.mock.calls.some(([input]) => input.type === "threads.workspace.select")).toBe(false);
  });

  it("should retain separate Git drafts and route late requests to their original checkout", async () => {
    const { project, request } = fixture();
    await project.workspaces.load();
    const primaryGit = project.gitStore;
    primaryGit.commitStore.setCommitMessage("Primary draft");
    await project.workspaces.select("B");
    expect(project.gitStore.commitStore.hasDraftMessage).toBe(false);
    await primaryGit.request({ type: "git.status", projectPath: primaryGit.projectPath, sourceId: "source" });
    expect(request).toHaveBeenLastCalledWith({
      type: "git.status", projectPath: "/A", sourceId: "source", workspaceId: "A"
    });
    await project.workspaces.select("A");
    expect(project.gitStore).toBe(primaryGit);
    expect(project.gitStore.commitStore.hasDraftMessage).toBe(true);
  });

  it("should observe drafts in both visible and background checkouts", async () => {
    const { root, project } = fixture();
    await project.workspaces.load();
    const activity: boolean[] = [];
    const dispose = autorun(() => { activity.push(root.hasPendingProjectActivity); });
    try {
      await project.workspaces.select("B");
      const secondary = project.gitStore;
      secondary.commitStore.setCommitMessage("Secondary draft");
      expect(activity.at(-1)).toBe(true);
      await project.workspaces.select("A");
      expect(root.hasPendingProjectActivity).toBe(true);
      secondary.commitStore.setCommitMessage("");
      expect(activity.at(-1)).toBe(false);
    } finally {
      dispose();
    }
  });

  it("should apply shared branch protections to every retained checkout", async () => {
    const { project } = fixture();
    await project.workspaces.load();
    const primary = project.gitStore;
    await project.workspaces.select("B");
    const secondary = project.gitStore;
    project.setProject({ ...project.project, preferences: { git: { commitProtectedBranches: ["main"] } } });
    expect(primary.commitProtectedBranches).toEqual(["main"]);
    expect(secondary.commitProtectedBranches).toEqual(["main"]);
  });

  it("should retain an uncertain creation error and reload its durable journal", async () => {
    const { project, request } = fixture();
    request.mockImplementation(async (input) => {
      if (input.type === "projectWorkspaces.create") throw new Error("Git reply lost; reconcile");
      if (input.type === "projectWorkspaces.list") return workspaces;
      return [{ id: "creation", destinationPath: "/B", state: "uncertain" }];
    });
    await project.workspaces.create("/B", { mode: "detached", startPoint: "HEAD" });
    expect(project.workspaces.error).toBe("Git reply lost; reconcile");
    expect(project.workspaces.pending[0].id).toBe("creation");
    expect(project.workspaces.isBusy).toBe(false);
  });

  it("should move a listed but unopened chat only after confirmation, without changing the selected chat", async () => {
    const { project, request } = fixture();
    await project.workspaces.load();
    const thread = createThread({ id: "unopened", projectPath: "/A", sourceId: "source" });
    project.threadListStore.threads = [thread];
    let confirm!: () => void;
    request.mockImplementation(async (input) => {
      if (input.type === "threads.workspace.select") return await new Promise<void>((resolve) => { confirm = resolve; });
      if (input.type === "projectWorkspaces.list") return workspaces;
      return [];
    });
    const switching = project.workspaces.select("B", "unopened");
    expect(project.threadListStore.findThread("unopened")?.projectPath).toBe("/A");
    confirm();
    await switching;
    expect(project.workspaces.error).toBeNull();
    expect(project.threadListStore.findThread("unopened")?.projectPath).toBe("/B");
    expect(project.selectedChatId).toBeNull();
    expect(request).toHaveBeenCalledWith({ type: "threads.workspace.select", threadId: "unopened", workspaceId: "B" });
  });

  it("should keep a conversation in its original group when the backend refuses the switch", async () => {
    const { project, request } = fixture();
    await project.workspaces.load();
    project.threadListStore.threads = [createThread({ id: "chat", projectPath: "/A", sourceId: "source" })];
    request.mockImplementation(async (input) => {
      if (input.type === "threads.workspace.select") throw new Error("Thread is active");
      if (input.type === "projectWorkspaces.list") return workspaces;
      return [];
    });
    await project.workspaces.select("B", "chat");
    expect(project.threadListStore.findThread("chat")?.projectPath).toBe("/A");
    expect(project.workspaces.error).toBe("Thread is active");
  });

  it("should send a plain project-scoped name and reload the catalogue", async () => {
    const { project, request } = fixture();
    await project.workspaces.rename("B", "Interface");
    expect(request).toHaveBeenCalledWith({ type: "projectWorkspaces.rename", projectId: "project", workspaceId: "B", name: "Interface" });
    expect(project.workspaces.workspaces).toHaveLength(2);
  });

  it("should discard an obsolete catalogue response", async () => {
    const { project, request } = fixture();
    let resolveOld!: (value: unknown) => void;
    request.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    const old = project.workspaces.load();
    await project.workspaces.load();
    resolveOld([]);
    await old;
    expect(project.workspaces.workspaces.map((item) => item.id)).toEqual(["A", "B"]);
  });
});
