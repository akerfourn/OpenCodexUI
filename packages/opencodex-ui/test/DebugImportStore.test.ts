import { describe, expect, it, vi } from "vitest";
import { isObservable, observable } from "mobx";
import type { RootStore } from "../src/stores/RootStore";
import { DebugImportStore } from "../src/stores/debug/DebugImportStore";
import { debugPayload } from "../src/stores/debug/debugPayload";

const context = { sourceId: "local", projectId: "project", workspaceId: "main", workspacePath: "/project" };

describe("debug import state", () => {
  it("should detect the file without reading or parsing it automatically", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, value: { kind: "file" } });
    const store = new DebugImportStore({ request } as unknown as RootStore, observable(context));
    await store.detect();
    expect(store.detected).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({
      type: "workspaceFiles.stat", target: { ...context, path: ".vscode/launch.json" }
    });
    expect(isObservable(request.mock.calls[0]?.[0].target)).toBe(false);
    expect(store.preview).toBeNull();
  });

  it("should keep a missing file quiet during detection but report an explicit import failure", async () => {
    const request = vi.fn().mockResolvedValueOnce({ ok: false, code: "inaccessible", details: "Missing" })
      .mockRejectedValueOnce(new Error("Cannot read launch.json"));
    const store = new DebugImportStore({ request } as unknown as RootStore, context);
    await store.detect();
    expect(store.error).toBeNull();
    expect(store.detected).toBe(false);
    await store.load();
    expect(store.error).toContain("Cannot read launch.json");
    expect(store.loading).toBe(false);
  });

  it("should discard results after a workspace panel is disposed", async () => {
    let resolve!: (value: unknown) => void;
    const request = vi.fn(() => new Promise(result => { resolve = result; }));
    const store = new DebugImportStore({ request } as unknown as RootStore, context);
    const pending = store.load();
    store.dispose();
    resolve({ entries: [{ name: "Old workspace" }], issues: [] });
    await pending;
    expect(store.preview).toBeNull();
  });

  it("should ignore an older import response after reloading the file", async () => {
    let firstResolve!: (value: unknown) => void;
    const request = vi.fn().mockImplementationOnce(() => new Promise(resolve => { firstResolve = resolve; }))
      .mockResolvedValueOnce({ entries: [], issues: [] });
    const store = new DebugImportStore({ request } as unknown as RootStore, context);
    const first = store.load();
    await store.load();
    firstResolve({ entries: [{ name: "Stale" }], issues: [] });
    await first;
    expect(store.preview?.entries).toEqual([]);
  });

  it("should clone an observable context before sending the preview action", () => {
    const result = debugPayload(observable({ kind: "previewImport" as const, context }));
    expect(isObservable(result)).toBe(false);
    expect("context" in result && isObservable(result.context)).toBe(false);
  });
});
