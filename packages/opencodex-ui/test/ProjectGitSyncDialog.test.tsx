// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectGitSyncActionX } from "../src/components/projects/ProjectGitSyncAction";
import { createGitSyncStoreFixture, syncInspection, syncResult } from "./ProjectGitSyncStore.fixture";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (input: string | string[], values?: { count?: number }) => {
  const key = Array.isArray(input) ? input[input.length - 1] : input;
  if (values?.count !== undefined) return `${key}:${values.count}`;
  return key;
} }) }));
let root: Root;
let container: HTMLDivElement;

/** Finds the actual action instead of its tooltip wrapper. */
function button(label: string): HTMLButtonElement {
  const value = [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === label);
  if (value === undefined) throw new Error(`Missing button: ${label}`);
  return value;
}
/** Finds a labelled Material UI text input through the DOM label association. */
function input(label: string): HTMLInputElement {
  const value = [...document.querySelectorAll<HTMLLabelElement>("label")].find((item) => item.textContent?.trim() === label);
  if (value === undefined) throw new Error(`Missing input: ${label}`);
  return document.getElementById(value.htmlFor) as HTMLInputElement;
}
/** Exercises the real observable aggregate and action/dialog composition. */
async function fixture(operation = false) {
  const test = createGitSyncStoreFixture();
  const onOpenFile = vi.fn();
  if (operation) {
    const inspection = syncInspection();
    inspection.operation = { kind: "rebase", branchName: "dev", fingerprint: "operation", conflicts: ["src/file.ts"] };
    test.request.mockResolvedValueOnce(syncResult("inspected", inspection));
  }
  await act(async () => { root.render(<ProjectGitSyncActionX gitStore={test.gitStore} onOpenFile={onOpenFile} />); });
  await act(async () => { await test.gitStore.sync.open(); });
  return { ...test, onOpenFile };
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.unstubAllGlobals();
});

describe("guided Git synchronization dialog", () => {
  it("should show fresh local and remote counts before allowing the reviewed push", async () => {
    const test = await fixture();
    expect(document.body.textContent).toContain("gitSync.localCommits:1");
    expect(document.body.textContent).toContain("gitSync.remoteCommits:2");
    expect(document.body.textContent).toContain("gitSync.actions.rebase");
    expect(document.body.textContent).toContain("https://origin.example.test/repository.git");
    expect(test.request.mock.calls.some(([request]) => request.type === "git.sync.execute")).toBe(false);
    await act(async () => { button("gitSync.execute").click(); });
    expect(test.request.mock.calls.some(([request]) => request.type === "git.sync.execute")).toBe(true);
    expect(document.body.textContent).toContain("gitSync.synchronized");
  });

  it("should require new analysis after editing the destination branch", async () => {
    const test = await fixture();
    await act(async () => {
      const field = input("gitSync.branch");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, "another");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(button("gitSync.execute").disabled).toBe(true);
    await act(async () => { button("gitSync.analyze").click(); });
    expect(test.request).toHaveBeenLastCalledWith(expect.objectContaining({ type: "git.sync.plan",
      target: { remoteName: "origin", branchName: "another", setUpstream: false } }));
    expect(button("gitSync.execute").disabled).toBe(false);
  });

  it("should open conflict contents in the existing editor without pushing", async () => {
    const test = await fixture(true);
    expect(document.body.textContent).toContain("src/file.ts");
    expect(button("gitSync.continue").disabled).toBe(true);
    await act(async () => { button("gitSync.openFile").click(); });
    expect(test.onOpenFile).toHaveBeenCalledWith("src/file.ts");
    expect(test.sync.isOpen).toBe(false);
    expect(test.request.mock.calls.map(([request]) => request.type)).toEqual(["git.sync.inspect"]);
  });

  it("should stage only the chosen resolution and require a fresh review after continuation", async () => {
    const test = await fixture(true);
    const resolved = syncInspection();
    resolved.operation = { kind: "rebase", branchName: "dev", fingerprint: "operation", conflicts: [] };
    test.request.mockResolvedValueOnce(syncResult("inspected", resolved));
    await act(async () => { button("gitSync.markResolved").click(); });
    expect(test.request).toHaveBeenCalledWith({ type: "git.sync.resolve", projectId: "project-1", projectPath: "/workspace/project", sourceId: "source-1",
      path: "src/file.ts", operation: { kind: "rebase", branchName: "dev", fingerprint: "operation", conflicts: ["src/file.ts"] } });
    expect(button("gitSync.continue").disabled).toBe(false);
    await act(async () => { button("gitSync.continue").click(); });
    expect(document.body.textContent).toContain("gitSync.continued");
    expect(test.request.mock.calls.some(([request]) => request.type === "git.sync.execute")).toBe(false);
  });

  it("should require explicit confirmation before aborting the reviewed operation", async () => {
    const test = await fixture(true);
    await act(async () => { button("gitSync.abort").click(); });
    expect(document.body.textContent).toContain("gitSync.abortDescription");
    expect(test.request).toHaveBeenCalledTimes(1);
    await act(async () => { button("gitSync.cancel").click(); });
    expect(test.request).toHaveBeenCalledTimes(1);
    await act(async () => { button("gitSync.abort").click(); });
    await act(async () => { button("gitSync.confirmAbort").click(); });
    expect(test.request).toHaveBeenLastCalledWith(expect.objectContaining({ type: "git.sync.abort", operation: {
      kind: "rebase", branchName: "dev", fingerprint: "operation", conflicts: ["src/file.ts"] } }));
    expect(document.body.textContent).toContain("gitSync.aborted");
  });

  it("should discard an abort confirmation if another operation replaces the reviewed state", async () => {
    const test = await fixture(true);
    await act(async () => { button("gitSync.abort").click(); });
    await act(async () => { runInAction(() => {
      const next = syncInspection();
      next.operation = { kind: "merge", branchName: "dev", fingerprint: "other", conflicts: ["src/other.ts"] };
      test.sync.result = syncResult("inspected", next);
    }); });
    expect(document.body.textContent).not.toContain("gitSync.abortDescription");
    expect(test.request).toHaveBeenCalledTimes(1);
  });

  it("should keep raw RPC and Git errors in details rather than the main explanation", async () => {
    const test = createGitSyncStoreFixture();
    const failure = { ...syncResult("error"), issue: "gitFailed", details: "Error invoking remote method: fatal: authentication failed" };
    test.request.mockResolvedValueOnce(failure);
    await act(async () => { root.render(<ProjectGitSyncActionX gitStore={test.gitStore} onOpenFile={vi.fn()} />); });
    await act(async () => { await test.gitStore.sync.open(); });
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("gitSync.issues.gitFailed");
    expect(document.querySelector('[role="alert"]')?.textContent).not.toContain("Error invoking");
    expect(document.body.textContent).toContain("gitSync.details");
    expect(test.request).toHaveBeenCalledTimes(1);
  });
});
