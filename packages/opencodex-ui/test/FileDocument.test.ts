import { describe, expect, it, vi } from "vitest";
import { FileDocument } from "../src/stores/files/FileDocument";
import { FileCloseStore } from "../src/stores/files/FileCloseStore";
import { WorkspaceTreeStore } from "../src/stores/files/WorkspaceTreeStore";
import { ProjectFilesStore } from "../src/stores/files/ProjectFilesStore";
import type { ProjectStore } from "../src/stores/project/ProjectStore";
import type { RootStore } from "../src/stores/RootStore";
import type { OpenCodexFileSnapshot } from "@open-codex-ui/opencodex-protocol";

const context = { sourceId: "source", projectId: "project", workspaceId: "main", workspacePath: "/main" };
const baseline: OpenCodexFileSnapshot = {
  content: "original",
  revision: "v1",
  bom: false,
  eol: "lf",
  readOnly: false
};

/** Creates a real document with a controlled transport boundary. */
async function fixture() {
  const request = vi.fn().mockResolvedValue({ ok: true, value: baseline });
  const document = new FileDocument("id", "file.txt", { ...context, path: "file.txt" }, "Main", { request });
  await document.reload();
  return { document, request };
}

/** Exposes a deferred reply to simulate source requests finishing out of order. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("file documents", () => {
  it("should preserve edits after save failure and retain the original source target", async () => {
    const { document, request } = await fixture();
    document.edit("user draft");
    request.mockRejectedValueOnce(new Error("Source disconnected"));
    expect(await document.save()).toBe(false);
    expect(document.content).toBe("user draft");
    expect(document.isDirty).toBe(true);
    expect(document.error?.details).toContain("Source disconnected");
    expect(request).toHaveBeenLastCalledWith({
      type: "workspaceFiles.save",
      target: { ...context, path: "file.txt" },
      revision: "v1",
      bom: false,
      content: "user draft"
    });
  });

  it("should preserve a dirty buffer across access revocation and restoration", async () => {
    const { document, request } = await fixture();
    document.edit("unsaved text");
    request.mockResolvedValueOnce({ ok: true, value: { readOnly: true } });
    await document.refreshAccess();
    expect(document.isReadOnly).toBe(true);
    expect(document.content).toBe("unsaved text");
    request.mockResolvedValueOnce({ ok: false, code: "accessDenied", details: "Revoked" });
    await document.refreshAccess();
    expect(document.isReadOnly).toBe(true);
    expect(document.isDirty).toBe(true);
    request.mockResolvedValueOnce({ ok: true, value: { readOnly: false } });
    await document.refreshAccess();
    expect(document.isReadOnly).toBe(false);
    expect(document.content).toBe("unsaved text");
    expect(document.error).toBeNull();
  });

  it("should keep edits made during a save dirty after acknowledgement", async () => {
    const { document, request } = await fixture();
    const reply = deferred<unknown>();
    document.edit("first edit");
    request.mockReturnValueOnce(reply.promise);
    const saving = document.save();
    expect(document.isSaving).toBe(true);
    document.edit("later edit");
    reply.resolve({ ok: true, value: { ...baseline, content: "first edit", revision: "v2" } });
    expect(await saving).toBe(false);
    expect(document.content).toBe("later edit");
    expect(document.savedContent).toBe("first edit");
    expect(document.isDirty).toBe(true);
  });

  it("should flag an external conflict without replacing local changes", async () => {
    const { document, request } = await fixture();
    document.edit("user draft");
    request.mockResolvedValueOnce({ ok: true, value: false });
    await document.checkExternal();
    expect(document.content).toBe("user draft");
    expect(document.hasConflict).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("should refresh a clean file while keeping its viewer state", async () => {
    const { document, request } = await fixture();
    document.viewState = { line: 42 };
    request
      .mockResolvedValueOnce({ ok: true, value: false })
      .mockResolvedValueOnce({ ok: true, value: { ...baseline, content: "agent edit", revision: "v2" } });
    await document.checkExternal();
    expect(document.content).toBe("agent edit");
    expect(document.isDirty).toBe(false);
    expect(document.viewState).toEqual({ line: 42 });
  });

  it("should retain readable contents when the file disappears", async () => {
    const { document, request } = await fixture();
    request.mockResolvedValueOnce({ ok: false, code: "inaccessible", details: "ENOENT" });
    await document.checkExternal();
    expect(document.content).toBe("original");
    expect(document.error?.code).toBe("inaccessible");
  });

  it("should isolate homonymous files, reuse documents and not steal focus after late reads", async () => {
    const first = deferred<unknown>();
    const request = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue({ ok: true, value: baseline });
    const root = { request, fileCloseStore: new FileCloseStore() } as unknown as RootStore;
    const files = new ProjectFilesStore({} as ProjectStore, root);
    const pending = files.open({ ...context, path: "file.txt" }, "Main");
    const original = files.active!;
    await files.open(
      { ...context, workspaceId: "secondary", workspacePath: "/secondary", path: "file.txt" },
      "Other"
    );
    const secondary = files.active!;
    files.showChat();
    first.resolve({ ok: true, value: { ...baseline, content: "main" } });
    await pending;
    expect(files.isVisible).toBe(false);
    expect(files.active).toBe(secondary);
    expect(original.content).toBe("main");
    expect(secondary.content).toBe("original");
    await files.open({ ...context, path: "file.txt" }, "Main");
    expect(files.active).toBe(original);
    expect(files.documents.size).toBe(2);
  });

  it("should ignore a late directory response after a refresh", async () => {
    const old = deferred<unknown>();
    const request = vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue({ ok: true, value: [{ name: "new", kind: "file" }] });
    const tree = new WorkspaceTreeStore(context, { request });
    const pending = tree.load("");
    tree.refresh();
    await Promise.resolve();
    old.resolve({ ok: true, value: [{ name: "old", kind: "file" }] });
    await pending;
    expect(tree.directories.get("")?.entries[0]?.name).toBe("new");
  });

  it("should keep close pending after a conflict, support cancellation and explicit discard", async () => {
    const { document, request } = await fixture();
    document.edit("draft");
    request.mockResolvedValue({ ok: false, code: "conflict", details: "Changed on disk" });
    const guard = new FileCloseStore();
    const close = vi.fn();
    const cancel = vi.fn();
    guard.request([document], close, cancel);
    await guard.save();
    expect(close).not.toHaveBeenCalled();
    expect(guard.documents).toHaveLength(1);
    guard.cancel();
    expect(cancel).toHaveBeenCalledOnce();
    expect(document.content).toBe("draft");
    guard.request([document], close);
    guard.discard();
    expect(close).toHaveBeenCalledOnce();
  });

  it("should close only after successful save and never during a pending write", async () => {
    const { document, request } = await fixture();
    const reply = deferred<unknown>();
    document.edit("draft");
    request.mockReturnValueOnce(reply.promise);
    const guard = new FileCloseStore();
    const close = vi.fn();
    guard.request([document], close);
    const saving = guard.save();
    guard.discard();
    expect(close).not.toHaveBeenCalled();
    reply.resolve({ ok: true, value: { ...baseline, content: "draft", revision: "v2" } });
    await saving;
    expect(close).toHaveBeenCalledOnce();
    expect(document.isDirty).toBe(false);
  });

  it("should expose virtual read-only documents without filesystem operations", () => {
    const request = vi.fn();
    const files = new ProjectFilesStore({} as ProjectStore, { request } as unknown as RootStore);
    const document = files.openVirtual("debug/source", "generated.js", "const x = 1", "javascript", {
      line: 1
    });
    document.edit("cannot edit");
    expect(document.content).toBe("const x = 1");
    expect(document.isReadOnly).toBe(true);
    expect(document.position).toEqual({ line: 1 });
    expect(request).not.toHaveBeenCalled();
  });
});
