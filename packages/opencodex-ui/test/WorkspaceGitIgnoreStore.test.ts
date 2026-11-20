import { observable, isObservable } from "mobx";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceGitIgnoreStore } from "../src/stores/files/WorkspaceGitIgnoreStore";
import type { FileRequestPort } from "../src/stores/files/FileDocument";

const context = { sourceId: "wsl", projectId: "project", workspaceId: "feature", workspacePath: "/repo/feature" };

describe("lazy explorer ignore decorations", () => {
  it("should batch visible paths as plain DTOs and request only newly displayed entries", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, value: ["node_modules"] });
    const store = new WorkspaceGitIgnoreStore(Object.freeze(context), { request } as FileRequestPort);
    const revision = {};
    await store.load(observable.array(["src", "node_modules"]), revision);
    await store.load(["src", "node_modules"], revision);
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith({ type: "workspaceFiles.ignored", target: { ...context, path: "" },
      paths: ["src", "node_modules"] });
    expect(isObservable(request.mock.calls[0][0].paths)).toBe(false);
    expect(isObservable(request.mock.calls[0][0].target)).toBe(false);
    expect(store.paths.get("node_modules")).toBe(true);
    expect(store.paths.get("src")).toBe(false);
    await store.load(["src", "node_modules", "README.md"], revision);
    expect(request.mock.calls[1][0].paths).toEqual(["README.md"]);
  });

  it("should split large visible batches and recheck changed ignore rules on the next Git snapshot", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, value: [] });
    const store = new WorkspaceGitIgnoreStore(context, { request } as FileRequestPort);
    const paths = Array.from({ length: 450 }, (_, index) => `file${index}`);
    const revision = {};
    await store.load(paths, revision);
    expect(request.mock.calls.map(call => call[0].paths.length)).toEqual([200, 200, 50]);
    request.mockResolvedValue({ ok: true, value: ["file0"] });
    await store.load(["file0"], {});
    expect(store.paths.size).toBe(1);
    expect(store.paths.get("file0")).toBe(true);
  });

  it("should discard old responses and preserve a new request after a refresh", async () => {
    let finish!: (value: unknown) => void;
    const request = vi.fn().mockReturnValueOnce(new Promise(resolve => { finish = resolve; }))
      .mockResolvedValue({ ok: true, value: [] });
    const store = new WorkspaceGitIgnoreStore(context, { request } as FileRequestPort);
    const previous = store.load(["src"], {});
    await store.load(["src"], {});
    finish({ ok: true, value: ["src"] });
    await previous;
    expect(store.paths.get("src")).toBe(false);
  });

  it("should report structured errors once and permit a later explicit retry", async () => {
    const request = vi.fn().mockResolvedValueOnce({ ok: false, code: "unavailable", details: "Source offline" })
      .mockResolvedValue({ ok: true, value: [] });
    const reportError = vi.fn();
    const store = new WorkspaceGitIgnoreStore(context, { request, reportError } as FileRequestPort);
    const revision = {};
    await store.load(["src"], revision);
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: "Source offline" }), context.workspacePath);
    await store.load(["src"], revision);
    expect(store.paths.get("src")).toBe(false);
  });
});
