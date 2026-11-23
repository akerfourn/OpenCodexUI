// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";
import { RootStore } from "../src/stores/RootStore";
import { AppTabsX } from "../src/components/app/AppTabs";
import { DiscussionsSidebarX } from "../src/components/discussions/DiscussionsSidebar";
import { discussion, discussionSource } from "./discussions.fixture";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe("personal chat navigation", () => {
  let container: HTMLDivElement;
  let reactRoot: Root;
  let store: RootStore;
  const request = vi.fn(async (_input: OpenCodexRequest): Promise<unknown> => []);

  beforeEach(() => {
    vi.clearAllMocks();
    request.mockResolvedValue([]);
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    reactRoot = createRoot(container);
    store = new RootStore({ request, onEvent: () => () => undefined });
    store.sourcesStore.sources = [discussionSource("source-a"), discussionSource("source-b")];
    store.appStore.settingsStore.settings.defaultSourceId = "source-a";
  });

  afterEach(() => {
    act(() => reactRoot.unmount());
    for (const environment of store.projectsStore.projectStoresById.values()) environment.clearMemory();
    container.remove();
  });

  it("should expose an accessible icon-only tab immediately after Home", () => {
    act(() => reactRoot.render(<AppTabsX store={store} />));
    const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];

    expect(tabs).toHaveLength(2);
    expect(tabs[1].getAttribute("aria-label")).toBe("discussions.title");
    expect(tabs[1].textContent).toBe("");
    act(() => tabs[1].click());
    expect(store.navigationStore.activeTabId).toBe("discussions");
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
  });

  it("should create a draft from the sidebar without calling native creation", () => {
    act(() => reactRoot.render(<DiscussionsSidebarX store={store} onOpenSubAgentDialog={vi.fn()} />));
    const button = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((element) => element.textContent?.includes("discussions.newConversation"))!;

    act(() => button.click());

    expect(store.discussionsStore.entries).toHaveLength(1);
    expect(store.activeChatStore?.isLocalDraft).toBe(true);
    expect(container.textContent).toContain("source-a");
    expect(request).not.toHaveBeenCalled();
  });

  it("should open a source-labelled row and offer chat actions without workspace switching", async () => {
    const record = discussion("personal", "source-b");
    const environment = store.discussionsStore.attachEnvironment(record.environment);
    environment.setThreads(record.threads);
    act(() => reactRoot.render(<DiscussionsSidebarX store={store} onOpenSubAgentDialog={vi.fn()} />));
    const row = container.querySelector<HTMLElement>(".MuiListItemButton-root")!;

    await act(async () => row.click());

    expect(store.discussionsStore.selected).toBe(environment);
    expect(request).toHaveBeenCalledWith({ type: "threads.open", threadId: "thread-personal", sourceId: "source-b" });
    expect(store.navigationStore.projectTabStores).toEqual([]);
    const menu = row.querySelector<HTMLButtonElement>('button[aria-label="sidebar.threadActions"]')!;
    act(() => menu.click());
    const labels = [...document.querySelectorAll('[role="menuitem"]')].map((element) => element.textContent);
    expect(labels).toContain("threadPermissions.button");
    expect(labels).toContain("sidebar.archiveThread");
    expect(labels).not.toContain("workspaces.switch");
  });

  it("should expose recovery and an explanatory abandonment confirmation for interrupted setup", async () => {
    const record = discussion("pending", "source-a");
    request.mockResolvedValue([{ ...record, threads: [], pendingCreation: {
      clientDraftId: "draft:11111111-1111-4111-8111-111111111111"
    } }]);
    await store.discussionsStore.load();
    act(() => reactRoot.render(<DiscussionsSidebarX store={store} onOpenSubAgentDialog={vi.fn()} />));
    expect(container.textContent).toContain("discussions.setupPending");
    const menu = container.querySelector<HTMLButtonElement>('button[aria-label="sidebar.threadActions"]')!;
    act(() => menu.click());
    const actions = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(actions.some((item) => item.textContent === "discussions.verifySetup")).toBe(true);
    const abandon = actions.find((item) => item.textContent === "discussions.abandonSetup")!;

    act(() => abandon.click());

    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("discussions.abandonSetupDescription");
    expect(request.mock.calls.some(([input]) => input.type === "discussions.cancelCreation")).toBe(false);
    expect(request.mock.calls.some(([input]) => input.type === "threads.delete")).toBe(false);
  });
});
