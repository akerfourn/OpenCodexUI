import { autorun, runInAction, isObservable } from "mobx";
import { describe, expect, it, vi } from "vitest";
import type { OpenCodexProject, OpenCodexProjectWorkspace, OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";
import { createThread } from "./chatStore/chatStoreFixtures";
import { RootStore } from "../src/stores/RootStore";
import { FileDocument } from "../src/stores/files/FileDocument";

/** Real stores with an isolated transport and stable source-owned checkout identities. */
function fixture() {
  const request = vi.fn(async (input: OpenCodexRequest): Promise<unknown> => {
    if (input.type === "projectWorkspaces.list") return workspaces;
    if (input.type === "projectWorkspaces.creations.list" || input.type === "projectWorkspaces.removals.list" || input.type === "projectWorkspaces.moves.list") return [];
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
  it("should fetch external lock metadata explicitly and re-read it after a confirmed change", async () => {
    const { project, request } = fixture();
    let reason: string | null = "External lock";
    request.mockImplementation(async input => {
      if (input.type === "projectWorkspaces.list") return workspaces;
      if (input.type === "projectWorkspaces.lock.read") return { workspaceId: "B", sourceId: "source",
        workspacePath: "/B", supported: true, lockedReason: reason };
      if (input.type === "projectWorkspaces.lock.update") {
        expect(isObservable(input.input)).toBe(false);
        reason = null;
      }
      return [];
    });
    await project.workspaces.load();
    expect(request.mock.calls.some(([input]) => input.type === "projectWorkspaces.lock.read")).toBe(false);
    await project.workspaces.loadLockState("B");
    const state = project.workspaces.lockStates.get("B")!;
    await project.workspaces.setLock(state, false, "");
    expect(request).toHaveBeenCalledWith({ type: "projectWorkspaces.lock.update", input: {
      projectId: "project", workspaceId: "B", sourceId: "source", workspacePath: "/B",
      locked: false, expectedReason: "External lock", reason: ""
    } });
    expect(project.workspaces.lockStates.get("B")?.lockedReason).toBeNull();
  });

  it("should show the actual Git result after a lost lock response without repeating the mutation", async () => {
    const { project, request } = fixture();
    request.mockImplementation(async input => {
      if (input.type === "projectWorkspaces.list") return workspaces;
      if (input.type === "projectWorkspaces.lock.update") throw new Error("reply lost");
      if (input.type === "projectWorkspaces.lock.read") return { workspaceId: "B", sourceId: "source",
        workspacePath: "/B", supported: true, lockedReason: "Kept" };
      return [];
    });
    await project.workspaces.load();
    await project.workspaces.setLock({ workspaceId: "B", sourceId: "source", workspacePath: "/B", supported: true, lockedReason: null }, true, "Kept");
    expect(project.workspaces.error).toBe("reply lost");
    expect(project.workspaces.lockStates.get("B")?.lockedReason).toBe("Kept");
    expect(request.mock.calls.filter(([input]) => input.type === "projectWorkspaces.lock.update")).toHaveLength(1);
  });

  it("should discard a late lock snapshot after the owning source changes", async () => {
    const { project, request } = fixture();
    await project.workspaces.load();
    let complete!: (value: unknown) => void;
    request.mockImplementation(async input => {
      if (input.type === "projectWorkspaces.lock.read") return await new Promise(resolve => { complete = resolve; });
      return [];
    });
    const pending = project.workspaces.loadLockState("B");
    runInAction(() => { project.workspaces.workspaces = project.workspaces.workspaces.map(item =>
      item.id === "B" ? { ...item, sourceId: "other" } : item); });
    complete({ workspaceId: "B", sourceId: "source", workspacePath: "/B", supported: true, lockedReason: "Old source lock" });
    await pending;
    expect(project.workspaces.lockStates.has("B")).toBe(false);
  });

  it("should send a plain storage-root move intent and follow the persisted destination without changing thread IDs", async () => {
    const { project, request } = fixture();
    let moved = false;
    request.mockImplementation(async input => {
      if (input.type === "projectWorkspaces.move") moved = true;
      if (input.type === "projectWorkspaces.list") return workspaces.map(item => item.id === "B" && moved ? { ...item, path: "/storage/project/B" } : item);
      return [];
    });
    await project.workspaces.load();
    project.upsertThread(createThread({ id: "thread", projectPath: "/B", sourceId: "source" }));
    await project.workspaces.select("B", null);
    await project.workspaces.move("B", "storage");
    expect(request).toHaveBeenCalledWith({ type: "projectWorkspaces.move", input: {
      projectId: "project", workspaceId: "B", sourceId: "source", rootId: "storage", destinationPath: undefined
    } });
    expect(project.findThread("thread")?.projectPath).toBe("/storage/project/B");
    expect(project.workspaces.current?.id).toBe("B");
  });

  it("should recover movement by operation ID without dispatching another physical move", async () => {
    const { project, request } = fixture();
    await project.workspaces.recoverMove("operation");
    expect(request).toHaveBeenCalledWith({ type: "projectWorkspaces.moves.reconcile", moveId: "operation" });
    expect(request.mock.calls.some(([input]) => input.type === "projectWorkspaces.move")).toBe(false);
  });

  it("should retain conversation metadata and the Git draft after a successful relocation", async () => {
    const { project, request } = fixture();
    let moved = false;
    request.mockImplementation(async input => {
      if (input.type === "projectWorkspaces.relocate") moved = true;
      if (input.type === "projectWorkspaces.list") return workspaces.map(item =>
        item.id === "B" && moved ? { ...item, path: "/moved" } : item);
      return [];
    });
    await project.workspaces.load();
    project.upsertThread(createThread({ id: "thread", projectPath: "/B", sourceId: "source" }));
    await project.workspaces.select("B", null);
    project.gitStore.commitStore.setCommitMessage("Keep this draft");
    await project.workspaces.relocate("B", "/moved", true);
    expect(request).toHaveBeenCalledWith({ type: "projectWorkspaces.relocate", projectId: "project", workspaceId: "B",
      sourceId: "source", destinationPath: "/moved", confirmIdentity: true });
    expect(project.findThread("thread")?.projectPath).toBe("/moved");
    expect(project.workspaces.current?.path).toBe("/moved");
    expect(project.gitStore.commitStore.commitMessage).toBe("Keep this draft");
  });

  it("should refresh relocated metadata after a lost response while retaining the reported error", async () => {
    const { project, request } = fixture();
    await project.workspaces.load();
    request.mockImplementation(async input => {
      if (input.type === "projectWorkspaces.relocate") throw new Error("reply lost");
      if (input.type === "projectWorkspaces.list") return workspaces.map(item => item.id === "A" ? { ...item, path: "/new" } : item);
      return [];
    });
    await project.workspaces.relocate("A", "/new", true);
    expect(project.project.path).toBe("/new");
    expect(project.workspaces.error).toBe("reply lost");
  });

  it("should send only stable deletion identities and retain removed workspace metadata", async () => {
    const { project, request } = fixture();
    let removed = false;
    request.mockImplementation(async input => {
      if (input.type === "projectWorkspaces.remove") removed = true;
      if (input.type === "projectWorkspaces.list") {
        return workspaces.map(item => item.id === "B" && removed ? { ...item, removedAt: "2026-10-22" } : item);
      }
      return [];
    });
    await project.workspaces.load();
    await project.workspaces.select("B", null);
    await project.workspaces.remove("B");
    expect(request).toHaveBeenCalledWith({ type: "projectWorkspaces.remove", projectId: "project",
      workspaceId: "B", sourceId: "source" });
    expect(project.workspaces.workspaces.find(item => item.id === "B")?.removedAt).toBe("2026-10-22");
    expect(project.workspaces.selectedId).toBe("A");
  });

  it("should preserve unsaved buffers and refuse physical deletion before sending a request", async () => {
    const { root, project, request } = fixture();
    const target = { sourceId: "source", projectId: "project", workspaceId: "B", workspacePath: "/B", path: "file.txt" };
    const document = new FileDocument("document", "file.txt", target, "Feature", root);
    document.content = "unsaved text";
    project.files.documents.set(document.id, document);
    await project.workspaces.remove("B");
    expect(request.mock.calls.some(([input]) => input.type === "projectWorkspaces.remove")).toBe(false);
    expect(document.content).toBe("unsaved text");
    expect(project.files.documents.has(document.id)).toBe(true);
    expect(project.workspaces.error).toContain("unsaved");
  });

  it("should reconcile removal by operation identity without repeating the destructive request", async () => {
    const { project, request } = fixture();
    await project.workspaces.recoverRemoval("removal-operation");
    expect(request).toHaveBeenCalledWith({ type: "projectWorkspaces.removals.reconcile", removalId: "removal-operation" });
    expect(request.mock.calls.some(([input]) => input.type === "projectWorkspaces.remove")).toBe(false);
  });

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
    expect(project.selectedChat?.isLocalDraft).toBe(true);
    expect(project.selectedChat?.thread.projectPath).toBe("/B");
    expect(request.mock.calls.some(([input]) => input.type === "threads.create")).toBe(false);
    expect(project.projectPath).toBe("/A");
  });

  it("should start a separate conversation in another checkout without switching the current one", async () => {
    const { project, request } = fixture();
    await project.workspaces.load();
    project.threadListStore.createThread("B");
    expect(project.selectedChat?.isLocalDraft).toBe(true);
    expect(project.selectedChat?.thread.projectPath).toBe("/B");
    expect(request.mock.calls.some(([input]) => input.type === "threads.create")).toBe(false);
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
