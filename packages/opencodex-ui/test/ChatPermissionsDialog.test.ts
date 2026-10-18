// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThreadActionsMenuX } from "../src/components/threads/ThreadActionsMenu";
import { ProjectStore } from "../src/stores/project/ProjectStore";
import { ChatEventLogStore } from "../src/stores/chat/ChatEventLogStore";
import { createThread } from "./chatStore/chatStoreFixtures";
import { createPermissionsFixture, permissionSnapshot } from "./threadPermissions.fixture";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let root: Root;
let container: HTMLDivElement;
let fixture: ReturnType<typeof createPermissionsFixture>;

/** Finds a real Material UI button by its translated text. */
function button(text: string): HTMLButtonElement {
  const result = [...document.querySelectorAll<HTMLButtonElement>("button")].find((element) => element.textContent === text);
  if (result === undefined) throw new Error(`Missing button: ${text}`);
  return result;
}

/** Opens a real MUI select through its browser mouse handler and chooses an option. */
async function select(labelId: string, value: string): Promise<void> {
  const control = document.querySelector<HTMLElement>(`[role="combobox"][aria-labelledby^="${labelId}"]`)!;
  await act(async () => { control.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })); });
  const option = document.querySelector<HTMLElement>(`[role="option"][data-value="${value}"]`)!;
  await act(async () => { option.click(); });
}

/** Opens the row's actual overflow menu without loading permissions yet. */
async function openMenu(): Promise<void> {
  await act(async () => { document.querySelector<HTMLButtonElement>('button[aria-label="sidebar.threadActions"]')!.click(); });
}

/** Finds the permission entry among the existing conversation actions. */
function permissionsItem(): HTMLElement {
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    .find((element) => element.textContent === "threadPermissions.button");
  if (item === undefined) throw new Error("Missing permission menu item");
  return item;
}

/** Opens the permission dialog through the row menu and flushes the native read. */
async function open(): Promise<void> {
  await openMenu();
  await act(async () => { permissionsItem().click(); });
}

describe("chat permission controls", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    fixture = createPermissionsFixture();
    Object.assign(fixture.project, {
      root: fixture.root,
      chatsById: new Map([[fixture.chat.thread.id, fixture.chat]]),
      workspaces: { isBusy: false },
      isReadOnlyFromCache: false,
      getOrCreateChat: ProjectStore.prototype.getOrCreateChat.bind(fixture.project)
    });
    Object.assign(fixture.root, {
      sourcesStore: { findSource: () => null },
      chatEventLogStore: new ChatEventLogStore(fixture.root)
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => { root.render(createElement(ThreadActionsMenuX, {
      project: fixture.project, root: fixture.root, thread: fixture.chat.thread,
      title: "Thread", onOpenSubAgentDialog: vi.fn()
    })); });
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    vi.unstubAllGlobals();
  });

  it("should display actual values without applying any permissions when opened", async () => {
    expect(fixture.request).not.toHaveBeenCalled();

    await openMenu();
    expect(fixture.request).not.toHaveBeenCalled();
    await act(async () => { permissionsItem().click(); });

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain("threadPermissions.readOnly");
    expect(document.body.textContent).toContain("threadPermissions.manual");
    expect(button("threadPermissions.apply").disabled).toBe(true);
    expect(fixture.request.mock.calls.map(([request]) => request.type)).toEqual(["threadPermissions.read"]);
  });

  it("should apply workspace access and automatic review to this existing chat only", async () => {
    await open();
    await select("chat-permission-access-label", "workspace-write");
    await select("chat-permission-reviewer-label", "auto_review");
    fixture.request.mockResolvedValueOnce(permissionSnapshot({ filesystem: "workspace-write",
      approvalsReviewer: "auto_review", revision: "new-revision" }));

    await act(async () => { button("threadPermissions.apply").click(); });

    expect(fixture.request.mock.calls[1][0]).toEqual({ type: "threadPermissions.change",
      context: { threadId: "thread-1", sourceId: "source-1" }, revision: "revision-1",
      patch: { filesystem: "workspace-write", networkAccess: false, approvalsReviewer: "auto_review" } });
    expect(document.body.textContent).toContain("threadPermissions.saved");
    expect(button("threadPermissions.apply").disabled).toBe(true);
    expect(fixture.chat.thread.id).toBe("thread-1");
  });

  it("should discard choices when closed without Apply", async () => {
    await open();
    await select("chat-permission-reviewer-label", "auto_review");

    await act(async () => { button("threadPermissions.close").click(); });
    await open();

    expect(fixture.request.mock.calls.map(([request]) => request.type)).toEqual(["threadPermissions.read", "threadPermissions.read"]);
    expect(fixture.permissions.approvalsReviewer).toBe("user");
    expect(button("threadPermissions.apply").disabled).toBe(true);
  });

  it("should preserve protected access controls while allowing an explicit reviewer edit", async () => {
    fixture.request.mockResolvedValue(permissionSnapshot({ canChangeAccess: false, profileId: "opencodex-context" }));

    await open();

    const access = document.querySelector('[role="combobox"][aria-labelledby^="chat-permission-access-label"]');
    expect(access?.getAttribute("aria-disabled")).toBe("true");
    expect(document.body.textContent).toContain("threadPermissions.protectedProfile");
    await select("chat-permission-reviewer-label", "auto_review");
    expect(button("threadPermissions.apply").disabled).toBe(false);
  });

  it("should show a rejection and require refresh instead of reporting success", async () => {
    await open();
    await select("chat-permission-reviewer-label", "auto_review");
    fixture.request.mockRejectedValueOnce(new Error("Permissions changed remotely"));

    await act(async () => { button("threadPermissions.apply").click(); });

    expect(document.querySelector('[role="alert"]')?.textContent).toBe("Permissions changed remotely");
    expect(document.body.textContent).not.toContain("threadPermissions.saved");
    expect(button("threadPermissions.apply").disabled).toBe(true);
    await act(async () => { button("threadPermissions.refresh").click(); });
    expect(fixture.permissions.snapshot).not.toBeNull();
  });

  it("should disable the menu entry for a running chat and local drafts", async () => {
    act(() => { runInAction(() => { fixture.chat.runtime.isWorking = true; }); });
    await openMenu();
    expect(permissionsItem().getAttribute("aria-disabled")).toBe("true");
    act(() => { runInAction(() => { fixture.chat.runtime.isWorking = false; fixture.chat.isLocalDraft = true; }); });
    expect(permissionsItem().getAttribute("aria-disabled")).toBe("true");
    expect(fixture.request).not.toHaveBeenCalled();
  });

  it("should manage an unloaded row without selecting it or using the displayed chat", async () => {
    const thread = createThread({ id: "other-thread", sourceId: "other-source" });
    fixture.project.selectedChatId = fixture.chat.thread.id;
    fixture.request.mockResolvedValue(permissionSnapshot({ threadId: thread.id, sourceId: thread.sourceId! }));
    act(() => { root.render(createElement(ThreadActionsMenuX, {
      project: fixture.project, root: fixture.root, thread, title: "Other thread", onOpenSubAgentDialog: vi.fn()
    })); });

    await open();

    expect(fixture.request).toHaveBeenCalledWith({ type: "threadPermissions.read",
      context: { threadId: "other-thread", sourceId: "other-source" } });
    expect(fixture.project.selectedChatId).toBe("thread-1");
    expect(fixture.project.openThread).not.toHaveBeenCalled();
    expect(fixture.permissions.snapshot).toBeNull();
    expect(fixture.project.chatsById.get(thread.id)?.permissions.snapshot?.threadId).toBe(thread.id);
  });

  it("should disable permissions for a cached project without contacting Codex", async () => {
    Object.assign(fixture.project, { isReadOnlyFromCache: true });

    await openMenu();

    expect(permissionsItem().getAttribute("aria-disabled")).toBe("true");
    expect(fixture.request).not.toHaveBeenCalled();
  });
});
