// @vitest-environment jsdom
import type { OpenCodexGitTag, OpenCodexGitTagListResult, OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectTagSelectorDialogX } from "../src/components/projects/ProjectTagSelectorDialog";
import { createFixture, createTag, type Fixture } from "./ProjectGitTagStore.fixture";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, options?: { name?: string }) => {
    if (options?.name !== undefined) return `${key}:${options.name}`;
    return key;
  } })
}));

let container: HTMLDivElement;
let root: Root;
let fixture: Fixture;
let onClose: ReturnType<typeof vi.fn>;
let tags: OpenCodexGitTag[];

/** Returns deterministic backend tag state through the real store's transport boundary. */
async function respond(request: OpenCodexRequest): Promise<unknown> {
  switch (request.type) {
    case "git.tags":
      return { tags, remoteName: "origin", remoteError: null };
    case "git.tag.create":
      tags = [...tags, createTag(request.tagName, "local-only")];
      return { tags, remoteName: "origin", remoteError: null };
    case "git.tag.push":
      tags = tags.map((tag) => {
        if (tag.name === request.tagName) return createTag(tag.name, "synced");
        return tag;
      });
      return { tags, remoteName: "origin", remoteError: null };
    case "git.tag.commitsSince":
      return 0;
    case "projects.preferences.update":
      return fixture.projectStore.project;
    default:
      throw new Error(`Unexpected fixture request: ${request.type}`);
  }
}

/** Changes search text with a browser event, bypassing React's native value tracker. */
async function search(value: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('input[type="text"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Finds a visible dialog button by its translated text. */
function buttonWithText(text: string): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")]
    .find((element) => element.textContent === text);
  if (button === undefined) throw new Error(`Missing button: ${text}`);
  return button;
}

describe("tag creation and publication dialog", () => {
  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    fixture = createFixture();
    tags = [createTag("v1", "synced")];
    fixture.request.mockImplementation(respond);
    onClose = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(ProjectTagSelectorDialogX, { tagStore: fixture.tagStore, open: true, onClose }));
    });
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    vi.unstubAllGlobals();
  });

  it("should keep the new tag visible and publish it from the same dialog", async () => {
    await search("  v2  ");

    await act(async () => { buttonWithText("git.createTag:v2").click(); });

    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(fixture.tagStore.selectedReferenceTagName).toBe("v2");
    expect(fixture.request).toHaveBeenCalledWith({ type: "git.tag.create",
      projectPath: "/workspace/project", sourceId: "source-1", tagName: "v2" });
    expect(document.querySelectorAll('[data-testid="CloudUploadOutlinedIcon"]')).toHaveLength(1);
    const push = document.querySelector<HTMLButtonElement>('button[aria-label="git.pushTag"]')!;
    expect(push.disabled).toBe(false);
    await act(async () => { push.click(); });

    expect(fixture.request).toHaveBeenCalledWith({ type: "git.tag.push",
      projectPath: "/workspace/project", sourceId: "source-1", tagName: "v2", force: false });
    expect(fixture.tagStore.tags.find((tag) => tag.name === "v2")?.syncStatus).toBe("synced");
    expect(document.querySelector('button[aria-label="git.pushTag"]')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("should keep the upload spinner visible while the store temporarily disallows another push", async () => {
    await search("v2");
    await act(async () => { buttonWithText("git.createTag:v2").click(); });
    let finish!: (result: OpenCodexGitTagListResult) => void;
    fixture.request.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));

    await act(async () => { document.querySelector<HTMLButtonElement>('button[aria-label="git.pushTag"]')!.click(); });

    const push = document.querySelector<HTMLButtonElement>('button[aria-label="git.pushTag"]')!;
    expect(push.disabled).toBe(true);
    expect(push.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => { finish({ tags: [createTag("v2", "synced")], remoteName: "origin", remoteError: null }); });
    expect(document.querySelector('button[aria-label="git.pushTag"]')).toBeNull();
  });

  it("should retain the creation form and display a failed creation without closing", async () => {
    await search("v2");
    fixture.request.mockRejectedValueOnce(new Error("Tag already exists"));

    await act(async () => { buttonWithText("git.createTag:v2").click(); });

    expect(document.querySelector('[role="alert"]')?.textContent).toBe("Tag already exists");
    expect(buttonWithText("git.createTag:v2").disabled).toBe(false);
    expect(fixture.tagStore.isCreatingTag).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("should display a push error and restore the same upload action for a retry", async () => {
    await search("v2");
    await act(async () => { buttonWithText("git.createTag:v2").click(); });
    fixture.request.mockRejectedValueOnce(new Error("Remote unavailable"));

    await act(async () => { document.querySelector<HTMLButtonElement>('button[aria-label="git.pushTag"]')!.click(); });

    expect(document.querySelector('[role="alert"]')?.textContent).toBe("Remote unavailable");
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="git.pushTag"]')?.disabled).toBe(false);
    expect(document.querySelectorAll('[data-testid="CloudUploadOutlinedIcon"]')).toHaveLength(1);
    expect(document.querySelector('button[aria-label="git.pushTag"] [role="progressbar"]')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("should still close when the user explicitly selects a reference tag", async () => {
    const row = document.querySelector<HTMLElement>(".MuiListItemButton-root")!;

    await act(async () => { row.click(); });

    expect(fixture.tagStore.selectedReferenceTagName).toBe("v1");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("should still close through the explicit close button", async () => {
    await act(async () => { buttonWithText("git.close").click(); });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
