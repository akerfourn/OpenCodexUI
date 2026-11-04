// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OpenCodexProject, OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";
import { RootStore } from "../src/stores/RootStore";
import { ThreadActionsMenuX } from "../src/components/threads/ThreadActionsMenu";
import { createThread } from "./chatStore/chatStoreFixtures";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
let root: Root;
let container: HTMLDivElement;

/** Finds visible actions by their stable accessible labels. */
function action(label: string): HTMLElement {
  const element = [...document.querySelectorAll<HTMLElement>('button,[role="menuitem"]')]
    .find(item => item.getAttribute("aria-label") === label || item.textContent === label);
  if (element === undefined) throw new Error(`Missing action ${label}`);
  return element;
}

/** Renders the actual menu and repair dialog with source-ready real project/chat stores. */
async function fixture(localDraft = false, readOnly = false) {
  const request = vi.fn(async (_input: OpenCodexRequest): Promise<unknown> => ({ ok: true }));
  const app = new RootStore({ request, onEvent: () => () => undefined });
  const project = app.projectsStore.openProjectTab({
    id: "project", path: "/repo", sourceId: "source", defaultName: "Project", displayName: null,
    preferences: {}, isHidden: false, createdAt: "", updatedAt: "", editedAt: "", lastSeenAt: ""
  } as OpenCodexProject, false);
  vi.spyOn(app.sourcesStore, "isSourceReady").mockReturnValue(!readOnly);
  const thread = createThread({ id: "blocked", sourceId: "source", projectPath: "/repo" });
  const chat = project.getOrCreateChat(thread);
  chat.isLocalDraft = localDraft;
  chat.runtime.isWorking = true;
  await act(async () => root.render(<StrictMode>
    <ThreadActionsMenuX project={project} root={app} thread={thread} title="Blocked chat" onOpenSubAgentDialog={vi.fn()} />
  </StrictMode>));
  await act(async () => action("sidebar.threadActions").click());
  return { request, project };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("conversation repair from the chat menu", () => {
  it("should expose repair without an earlier workspace error despite a stale working flag", async () => {
    const { request, project } = await fixture();
    expect(project.workspaces.error).toBeNull();
    expect(action("threadRepair.title").getAttribute("aria-disabled")).not.toBe("true");
    await act(async () => action("threadRepair.title").click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("threadRepair.description");
    expect(request).not.toHaveBeenCalled();
    await act(async () => action("threadRepair.submit").click());
    expect(request.mock.calls.map(([input]) => input)).toEqual([
      { type: "threads.workspace.reconcile", threadId: "blocked" },
      { type: "threads.recover", threadId: "blocked" }
    ]);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("threadRepair.success");
  });

  it("should show a failed verification and let the user retry without an automatic message", async () => {
    const { request } = await fixture();
    request.mockRejectedValueOnce(new Error("Thread is active or its execution status is unknown."));
    await act(async () => action("threadRepair.title").click());
    await act(async () => action("threadRepair.submit").click());
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("threadRepair.failed");
    expect(dialog.querySelector("details")?.textContent).toContain("Thread is active");
    expect(dialog.textContent).not.toContain("threadRepair.success");
    expect(action("threadRepair.submit").hasAttribute("disabled")).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([[true, false], [false, true]])(
    "should keep repair visible but disabled for drafts or unavailable sources (%s, %s)", async (draft, readOnly) => {
      const { request } = await fixture(draft, readOnly);
      expect(action("threadRepair.title").getAttribute("aria-disabled")).toBe("true");
      expect(request).not.toHaveBeenCalled();
    }
  );
});
