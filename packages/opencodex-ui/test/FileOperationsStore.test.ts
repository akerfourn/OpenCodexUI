import { describe, expect, it, vi } from "vitest";
import type { OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";
import { FileCloseStore } from "../src/stores/files/FileCloseStore";
import { ProjectFilesStore } from "../src/stores/files/ProjectFilesStore";
import { WorkspaceTreeStore } from "../src/stores/files/WorkspaceTreeStore";
import type { RootStore } from "../src/stores/RootStore";
import type { ProjectStore } from "../src/stores/project/ProjectStore";

const context = { sourceId: "remote", projectId: "project", workspaceId: "ws", workspacePath: "/remote" };

/** Uses real document and close stores with an isolated, clone-checked transport. */
function fixture() {
  const contents = new Map([["folder/file.txt", "original"], ["folder/other.txt", "other"], ["unrelated.txt", "unrelated"]]);
  const request = vi.fn(async (input: OpenCodexRequest) => {
    const payload = structuredClone(input);
    if (payload.type === "workspaceFiles.list") return { ok: true, value: [] };
    if (payload.type === "workspaceFiles.save") contents.set(payload.target.path, payload.content);
    if (payload.type === "workspaceFiles.read" || payload.type === "workspaceFiles.save") {
      return { ok: true, value: { content: contents.get(payload.target.path) ?? "", revision: payload.target.path,
        bom: false, eol: "lf", readOnly: false } };
    }
    if (payload.type === "workspaceFiles.rename") {
      const parent = payload.target.path.split("/").slice(0, -1).join("/");
      const path = [parent, payload.name].filter(Boolean).join("/");
      for (const [key, value] of [...contents]) {
        if (key === payload.target.path || key.startsWith(`${payload.target.path}/`)) {
          contents.set(path + key.slice(payload.target.path.length), value);
          contents.delete(key);
        }
      }
      return { ok: true, value: { path } };
    }
    if (payload.type === "workspaceFiles.delete") return { ok: true, value: { path: payload.target.path } };
    if (payload.type === "workspaceFiles.copy") return { ok: true, value: { path: `${payload.destinationPath}/${payload.name}` } };
    throw new Error(`Unexpected request: ${payload.type}`);
  });
  const fileCloseStore = new FileCloseStore();
  const refresh = vi.fn();
  const getGitStoreForWorkspace = vi.fn(() => ({ statusStore: { refresh } }));
  const root = { request, fileCloseStore } as unknown as RootStore;
  const files = new ProjectFilesStore({ getGitStoreForWorkspace } as unknown as ProjectStore, root);
  const tree = new WorkspaceTreeStore(context, root);
  return { request, fileCloseStore, files, tree, operations: files.operations, refresh, getGitStoreForWorkspace };
}

describe("file explorer operations", () => {
  it("should copy a source reference and paste with an explicit name in the captured workspace", async () => {
    const { operations, tree, request, refresh } = fixture();
    operations.copy(tree, "folder/file.txt");
    expect(request).not.toHaveBeenCalled();
    operations.paste(tree, "");
    operations.setName("copy.txt");
    await operations.submit();
    expect(request).toHaveBeenCalledWith({ type: "workspaceFiles.copy",
      target: { ...context, path: "folder/file.txt" }, destinationPath: "", name: "copy.txt" });
    expect(operations.dialog).toBeNull();
    expect(operations.clipboard?.path).toBe("folder/file.txt");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("should disallow pasting into a different source, project, workspace or root", () => {
    const { operations, tree, request } = fixture();
    operations.copy(tree, "folder");
    for (const patch of [{ sourceId: "other" }, { projectId: "other" }, { workspaceId: "other" }, { workspacePath: "/other" }]) {
      const foreign = new WorkspaceTreeStore({ ...context, ...patch }, { request });
      expect(operations.canPaste(foreign)).toBe(false);
      operations.paste(foreign, "");
      expect(operations.dialog).toBeNull();
    }
  });

  it("should wait for explicit submit and allow canceling a delete without touching the source", () => {
    const { operations, tree, request } = fixture();
    operations.select("delete", tree, "folder");
    expect(operations.dialog?.kind).toBe("delete");
    expect(request).not.toHaveBeenCalled();
    operations.close();
    expect(operations.dialog).toBeNull();
  });

  it("should cancel a dirty-document deletion while preserving all unsaved text", async () => {
    const { files, operations, tree, request, fileCloseStore } = fixture();
    await files.open({ ...context, path: "folder/file.txt" }, "Remote");
    const document = files.active!;
    document.edit("draft");
    operations.select("delete", tree, "folder");
    const pending = operations.submit();
    expect(fileCloseStore.documents).toEqual([document]);
    expect(request.mock.calls.some(([payload]) => payload.type === "workspaceFiles.delete")).toBe(false);
    fileCloseStore.cancel();
    await pending;
    expect(files.active).toBe(document);
    expect(document.content).toBe("draft");
    expect(operations.isBusy).toBe(false);
  });

  it("should save dirty descendants before renaming their tabs and preserve the current selection", async () => {
    const { files, operations, tree, fileCloseStore, request } = fixture();
    await files.open({ ...context, path: "folder/other.txt" }, "Remote");
    await files.open({ ...context, path: "folder/file.txt" }, "Remote");
    files.active!.edit("saved draft");
    files.active!.setImageZoom(2);
    tree.expanded.add("folder");
    operations.select("rename", tree, "folder");
    operations.setName("renamed");
    const pending = operations.submit();
    await fileCloseStore.save();
    await pending;
    expect(files.active?.target?.path).toBe("renamed/file.txt");
    expect(files.active?.content).toBe("saved draft");
    expect(files.active?.imageZoom).toBe(2);
    expect(files.active?.isDirty).toBe(false);
    expect(tree.expanded.has("renamed")).toBe(true);
    expect(tree.expanded.has("folder")).toBe(false);
    expect([...files.documents.values()].map(document => document.target?.path).sort())
      .toEqual(["renamed/file.txt", "renamed/other.txt"]);
    const types = request.mock.calls.map(([payload]) => payload.type);
    expect(types.indexOf("workspaceFiles.save")).toBeLessThan(types.indexOf("workspaceFiles.rename"));
  });

  it("should retain buffers and the dialog when a source refuses a mutation after discard", async () => {
    const { files, operations, tree, fileCloseStore, request } = fixture();
    await files.open({ ...context, path: "folder/file.txt" }, "Remote");
    const document = files.active!;
    document.edit("retain this draft");
    operations.select("rename", tree, "folder");
    operations.setName("existing");
    request.mockResolvedValueOnce({ ok: false, code: "alreadyExists", details: "Exists" } as never);
    const pending = operations.submit();
    fileCloseStore.discard();
    await pending;
    expect(document.content).toBe("retain this draft");
    expect(files.active).toBe(document);
    expect(operations.error?.code).toBe("alreadyExists");
    expect(operations.name).toBe("existing");
    expect(operations.dialog).not.toBeNull();
  });

  it("should close only descendants in the deleted workspace and keep chat visible", async () => {
    const { files, operations, tree } = fixture();
    await files.open({ ...context, path: "folder/file.txt" }, "Remote");
    await files.open({ ...context, workspaceId: "other", path: "folder/file.txt" }, "Other");
    const other = files.active;
    files.showChat();
    operations.select("delete", tree, "folder");
    await operations.submit();
    expect(files.documents.size).toBe(1);
    expect(files.active).toBe(other);
    expect(files.isVisible).toBe(false);
  });

  it("should keep saved contents readable when the source disconnects after a successful rename", async () => {
    const { files, operations, tree, request } = fixture();
    await files.open({ ...context, path: "folder/file.txt" }, "Remote");
    operations.select("rename", tree, "folder/file.txt");
    operations.setName("renamed.txt");
    request.mockResolvedValueOnce({ ok: true, value: { path: "folder/renamed.txt" } } as never)
      .mockRejectedValueOnce(new Error("Source disconnected"));
    await operations.submit();
    expect(files.active?.target?.path).toBe("folder/renamed.txt");
    expect(files.active?.content).toBe("original");
    expect(files.active?.isDirty).toBe(false);
    expect(files.active?.error?.code).toBe("unavailable");
  });
});
