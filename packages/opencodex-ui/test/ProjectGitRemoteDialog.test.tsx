// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenCodexGitRemote } from "@open-codex-ui/opencodex-protocol";

import { ProjectGitRemoteDialogX } from "../src/components/projects/ProjectGitRemoteDialog";
import {
  createDeferred, createProjectGitReferencesFixture, createRemote, createStatus
} from "./ProjectGitReferencesStore.fixture";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string | string[], values?: { name?: string }) => `${Array.isArray(key) ? key[key.length - 1] : key} ${values?.name ?? ""}`.trim() })
}));

let root: Root;
let container: HTMLDivElement;

/** Finds a visible labelled action without matching tooltip wrapper elements. */
function button(label: string): HTMLButtonElement {
  const result = [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => (
    item.getAttribute("aria-label") === label || item.textContent?.trim() === label
  ));
  if (result === undefined) throw new Error(`Missing button: ${label}`);
  return result;
}

/** Resolves a real Material UI input through its accessible label. */
function input(label: string): HTMLInputElement {
  const element = [...document.querySelectorAll<HTMLLabelElement>("label")]
    .find((item) => item.textContent?.trim() === label);
  if (element === undefined) throw new Error(`Missing input: ${label}`);
  return document.getElementById(element.htmlFor) as HTMLInputElement;
}

/** Dispatches native text input events so React applies the same changes as typing. */
async function typeValue(label: string, value: string): Promise<void> {
  await act(async () => {
    const target = input(label);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(target, value);
    target.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Renders the real observable store against a deterministic local configuration transport. */
function fixture() {
  let remotes: OpenCodexGitRemote[] = [createRemote("origin"), {
    name: "upstream", fetchUrl: "https://upstream.example.test/project.git", pushUrl: "ssh://push.example.test/project.git"
  }];
  const fixture = createProjectGitReferencesFixture({ status: createStatus({ remotes }) });
  fixture.request.mockImplementation(async (request) => {
    if (request.type === "git.remotes") return remotes.map((remote) => ({ ...remote }));
    if (request.type === "git.remote.upsert") {
      if (request.mode === "add") {
        remotes = [...remotes, { name: request.name, fetchUrl: request.url, pushUrl: request.url }];
      } else {
        remotes = remotes.map((remote) => remote.name === request.name ? { ...remote, fetchUrl: request.url } : remote);
      }
      return createStatus({ remotes });
    }
    if (request.type === "git.remote.remove") {
      remotes = remotes.filter((remote) => remote.name !== request.name);
      return createStatus({ remotes });
    }
    throw new Error(`Unexpected request: ${request.type}`);
  });
  const onClose = vi.fn();
  /** Opens or reopens the same dialog to exercise persisted selection resets. */
  async function render(open = true): Promise<void> {
    await act(async () => { root.render(<ProjectGitRemoteDialogX
      referencesStore={fixture.gitStore.referencesStore} open={open} onClose={onClose} />); });
  }
  return { ...fixture, render, onClose };
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

describe("Git remote management", () => {
  it("should list every remote with its distinct fetch and push addresses", async () => {
    const test = fixture();
    await test.render();
    expect(document.querySelector('section[aria-label="origin"]')).not.toBeNull();
    const upstream = document.querySelector('section[aria-label="upstream"]');
    expect(upstream?.textContent).toContain("https://upstream.example.test/project.git");
    expect(upstream?.textContent).toContain("ssh://push.example.test/project.git");
    expect(test.request).toHaveBeenCalledWith({
      type: "git.remotes", projectPath: "/workspace/project", sourceId: "source-1"
    });
  });

  it("should edit the selected remote without creating another name or replacing its push URL", async () => {
    const test = fixture();
    await test.render();
    await act(async () => { button("git.remoteEdit upstream").click(); });
    expect(input("git.remoteName").value).toBe("upstream");
    expect(input("git.remoteName").readOnly).toBe(true);
    expect(input("git.remoteFetchUrl").value).toBe("https://upstream.example.test/project.git");
    expect(input("git.remotePushUrl").readOnly).toBe(true);
    await typeValue("git.remoteFetchUrl", "https://changed.example.test/project.git");
    await act(async () => { button("git.remoteSave").click(); });

    expect(test.request).toHaveBeenCalledWith({ type: "git.remote.upsert", projectPath: "/workspace/project",
      sourceId: "source-1", name: "upstream", url: "https://changed.example.test/project.git", mode: "update" });
    expect(document.querySelector('section[aria-label="origin"]')).not.toBeNull();
    expect(document.querySelector('section[aria-label="upstream"]')?.textContent).toContain("ssh://push.example.test/project.git");
    expect(test.onClose).not.toHaveBeenCalled();
  });

  it("should start additions empty and reject a duplicate name without changing existing remotes", async () => {
    const test = fixture();
    await test.render();
    await act(async () => { button("git.remoteAdd").click(); });
    expect(input("git.remoteName").value).toBe("");
    expect(input("git.remoteFetchUrl").value).toBe("");
    await typeValue("git.remoteName", "origin");
    await typeValue("git.remoteFetchUrl", "/backup.git");
    expect(button("git.remoteSave").disabled).toBe(true);
    expect(document.body.textContent).toContain("git.remoteNameExists");
    await typeValue("git.remoteName", "backup");
    await act(async () => { button("git.remoteSave").click(); });
    expect(test.request).toHaveBeenCalledWith({ type: "git.remote.upsert", projectPath: "/workspace/project",
      sourceId: "source-1", name: "backup", url: "/backup.git", mode: "add" });
    expect(document.querySelectorAll("section")).toHaveLength(3);
  });

  it("should remove only the reviewed remote after explicit confirmation", async () => {
    const test = fixture();
    await test.render();
    await act(async () => { button("git.remoteRemove upstream").click(); });
    expect(document.body.textContent).toContain("git.remoteRemoveDescription upstream");
    expect(test.request.mock.calls.some(([request]) => request.type === "git.remote.remove")).toBe(false);
    await act(async () => { button("git.cancel").click(); });
    expect(document.querySelector('section[aria-label="upstream"]')).not.toBeNull();
    await act(async () => { button("git.remoteRemove upstream").click(); });
    await act(async () => { button("git.remoteRemoveConfirm").click(); });
    expect(test.request).toHaveBeenCalledWith({ type: "git.remote.remove", projectPath: "/workspace/project",
      sourceId: "source-1", name: "upstream" });
    expect(document.querySelector('section[aria-label="upstream"]')).toBeNull();
    expect(document.querySelector('section[aria-label="origin"]')).not.toBeNull();
    await test.render(false);
    await test.render();
    expect(document.querySelectorAll("section")).toHaveLength(1);
  });

  it("should keep a failed removal visible and allow retrying the same confirmation", async () => {
    const test = fixture();
    await test.render();
    test.request.mockRejectedValueOnce(new Error("Configuration locked"));
    await act(async () => { button("git.remoteRemove upstream").click(); });
    await act(async () => { button("git.remoteRemoveConfirm").click(); });
    expect(document.body.textContent).toContain("Configuration locked");
    expect(document.querySelector('section[aria-label="upstream"]')).not.toBeNull();
    await act(async () => { button("git.remoteRemoveConfirm").click(); });
    expect(document.querySelector('section[aria-label="upstream"]')).toBeNull();
  });

  it("should require a successful listing before editing cached entries after a read error", async () => {
    const test = fixture();
    test.request.mockRejectedValueOnce(new Error("Cannot read remotes"));
    await test.render();
    expect(button("git.remoteEdit upstream").disabled).toBe(true);
    expect(button("git.remoteAdd").disabled).toBe(true);
    await act(async () => { button("git.remoteRefresh").click(); });
    expect(button("git.remoteEdit upstream").disabled).toBe(false);
  });

  it("should prevent dismissal and duplicate writes while saving configuration", async () => {
    const test = fixture();
    await test.render();
    await act(async () => { button("git.remoteEdit upstream").click(); });
    const save = createDeferred<ReturnType<typeof createStatus>>();
    test.request.mockReturnValueOnce(save.promise);
    await act(async () => { button("git.remoteSave").click(); });
    expect(button("git.remoteSave").disabled).toBe(true);
    expect(button("git.close").disabled).toBe(true);
    expect(input("git.remoteFetchUrl").disabled).toBe(true);
    await act(async () => { save.resolve(createStatus({ remotes: [createRemote("origin"), createRemote("upstream")] })); });
    expect(test.onClose).not.toHaveBeenCalled();
  });
});
