import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";
import { discussion, discussionSource } from "./discussions.fixture";
import { RootStore } from "../src/stores/RootStore";
import { DISCUSSIONS_TAB_ID } from "../src/stores/app/NavigationStore";

const roots: RootStore[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    for (const environment of root.projectsStore.projectStoresById.values()) environment.clearMemory();
  }
});

describe("personal conversations", () => {
  it("should create a local draft in the fixed tab without allocating a directory or Home project", () => {
    const { root, request } = fixture();
    root.discussionsStore.createDraft();
    const environment = root.discussionsStore.selected!;
    const chat = environment.selectedChat!;
    root.discussionsStore.setSource("source-b");

    expect(root.navigationStore.activeTabId).toBe(DISCUSSIONS_TAB_ID);
    expect(root.navigationStore.projectTabStores).toEqual([]);
    expect(root.projectsStore.projects).toEqual([]);
    expect(chat.isLocalDraft).toBe(true);
    expect(chat.sourceId).toBe("source-a");
    expect(environment.project.path).toBe("");
    expect(request).not.toHaveBeenCalled();
  });

  it("should preserve the composer through an early creation event and send in its original source", async () => {
    const { root, request } = fixture();
    root.discussionsStore.createDraft();
    const environment = root.discussionsStore.selected!;
    const chat = environment.selectedChat!;
    const initialViewId = chat.viewId;
    chat.composer.setModel("chosen-model");
    chat.composer.setReasoningEffort("high");
    chat.composer.setDraft("Analyse ce document", "Analyse ce document", []);
    root.discussionsStore.setSource("source-b");
    const persisted = discussion("personal", "source-a");
    request.mockImplementation(async (input: OpenCodexRequest) => {
      structuredClone(input);
      if (input.type === "discussions.create") {
        root.handleEvent({ type: "thread.created", clientDraftId: input.clientDraftId, thread: persisted.threads[0], turns: [] });
        return persisted;
      }
      if (input.type === "projectWorkspaces.list") return [{ id: "workspace", projectId: "personal",
        sourceId: "source-a", path: "/personal", removedAt: null, isPrimary: true }];
      if (input.type === "turn.start") return { turnId: "first-turn" };
      return [];
    });

    expect(await chat.composer.submit()).toBe(true);

    expect(root.discussionsStore.selected).toBe(environment);
    expect(environment.project).toMatchObject({ id: "personal", path: "/personal", kind: "discussion" });
    expect(environment.selectedChat).toBe(chat);
    expect(chat.viewId).toBe(initialViewId);
    expect(chat.thread.id).toBe("thread-personal");
    expect(chat.composer.selectedModel).toBe("chosen-model");
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ type: "turn.start", sourceId: "source-a",
      threadId: "thread-personal", projectPath: "/personal", model: "chosen-model", reasoningEffort: "high" }));
    expect(root.projectsStore.projects).toEqual([]);
    expect(root.navigationStore.projectTabStores).toEqual([]);
  });

  it("should keep an unsuccessful first message and reuse the same draft token on retry", async () => {
    const { root, request } = fixture();
    root.discussionsStore.createDraft();
    const chat = root.discussionsStore.selected!.selectedChat!;
    chat.composer.setDraft("Keep this request", "Keep this request", []);
    const id = chat.thread.id;
    request.mockImplementation(async (input: OpenCodexRequest) => {
      if (input.type === "discussions.create") throw new Error("Source disconnected");
      return [];
    });

    expect(await chat.composer.submit()).toBe(false);
    expect(await chat.composer.submit()).toBe(false);

    expect(chat.isLocalDraft).toBe(true);
    expect(chat.composer.draft).toBe("Keep this request");
    expect(request.mock.calls.filter(([input]) => input.type === "discussions.create").map(([input]) => input.clientDraftId))
      .toEqual([id, id]);
    expect(request.mock.calls.some(([input]) => input.type === "turn.start")).toBe(false);
  });

  it("should reload the collection, preserve a local draft and open notifications in the personal tab", async () => {
    const { root, request } = fixture();
    root.discussionsStore.createDraft();
    const localDraft = root.discussionsStore.selected!.selectedChat!;
    const persisted = discussion("personal", "source-b");
    request.mockImplementation(async (input: OpenCodexRequest) => {
      if (input.type === "discussions.list") return [persisted];
      return [];
    });
    await root.discussionsStore.load();

    expect(root.discussionsStore.entries.map(({ thread }) => thread.id)).toContain(localDraft.thread.id);
    expect(root.discussionsStore.entries.map(({ thread }) => thread.id)).toContain("thread-personal");
    root.projectsStore.navigateToThread("source-b", "thread-personal");

    expect(root.navigationStore.activeTabId).toBe(DISCUSSIONS_TAB_ID);
    expect(root.activeChatStore?.thread.id).toBe("thread-personal");
    expect(root.activeChatStore?.sourceId).toBe("source-b");
    expect(root.projectsStore.projects).toEqual([]);
    expect(root.navigationStore.projectTabStores).toEqual([]);
  });

  it("should reconstruct a cached personal notification route without creating a project tab", () => {
    const { root } = fixture();
    const persisted = discussion("restored", null);
    root.projectsStore.navigateToThreadFromNotification(null, "thread-restored");
    root.handleEvent({ type: "thread.opened", thread: persisted.threads[0], turns: [] });
    const environment = root.projectsStore.findProjectStoreForThread("thread-restored", null)!;

    expect(root.discussionsStore.selected).toBe(environment);
    expect(root.activeChatStore?.isReadOnlyFromCache).toBe(true);
    expect(root.projectsStore.projects).toEqual([]);
    expect(root.navigationStore.projectTabStores).toEqual([]);
  });

  it("should route live updates to their owning source while another personal chat is selected", () => {
    const { root } = fixture();
    const first = discussion("first", "source-a");
    const second = discussion("second", "source-b");
    const firstStore = root.discussionsStore.attachEnvironment(first.environment);
    const secondStore = root.discussionsStore.attachEnvironment(second.environment);
    const firstChat = firstStore.getOrCreateChat(first.threads[0]);
    const secondChat = secondStore.getOrCreateChat(second.threads[0]);
    root.discussionsStore.selectedEnvironmentId = secondStore.project.id;

    root.handleEvent({ type: "thread.sync.started", sourceId: "source-a", threadId: firstChat.thread.id });

    expect(firstChat.runtime.isSyncing).toBe(true);
    expect(secondChat.runtime.isSyncing).toBe(false);
    expect(root.discussionsStore.selected).toBe(secondStore);
  });

  it("should restore interrupted setup after restart and verify it without sending a message", async () => {
    const { root, request } = fixture();
    const persisted = discussion("pending", "source-a");
    const pendingId = "draft:11111111-1111-4111-8111-111111111111";
    request.mockImplementation(async (input: OpenCodexRequest) => {
      if (input.type === "discussions.list") return [{ ...persisted, threads: [], pendingCreation: { clientDraftId: pendingId } }];
      if (input.type === "discussions.create") return persisted;
      return [];
    });
    await root.discussionsStore.load();
    const environment = root.discussionsStore.entries[0].environment;
    const chat = environment.chatsById.get(pendingId)!;
    chat.composer.setDraft("Do not send during repair", "Do not send during repair", []);

    await root.discussionsStore.recoverCreation(environment);

    expect(chat.isLocalDraft).toBe(false);
    expect(chat.thread.id).toBe("thread-pending");
    expect(chat.composer.draft).toBe("Do not send during repair");
    expect(request).toHaveBeenCalledWith({ type: "discussions.create", sourceId: "source-a", clientDraftId: pendingId });
    expect(request.mock.calls.some(([input]) => input.type === "turn.start")).toBe(false);
  });

  it("should abandon a persisted setup through its explicit context rather than delete an unknown thread", async () => {
    const { root, request } = fixture();
    const persisted = discussion("pending", "source-a");
    request.mockImplementation(async (input: OpenCodexRequest) => {
      if (input.type === "discussions.list") return [{ ...persisted, threads: [],
        pendingCreation: { clientDraftId: "draft:11111111-1111-4111-8111-111111111111" } }];
      return [];
    });
    await root.discussionsStore.load();
    const environment = root.discussionsStore.entries[0].environment;

    await root.discussionsStore.cancelCreation(environment);

    expect(root.discussionsStore.entries).toEqual([]);
    expect(request).toHaveBeenCalledWith({ type: "discussions.cancelCreation", environmentId: "pending", sourceId: "source-a" });
    expect(request.mock.calls.some(([input]) => input.type === "threads.delete")).toBe(false);
  });

  it("should reuse a live draft when a catalogue refresh observes its setup before the native reply", async () => {
    const { root, request } = fixture();
    root.discussionsStore.createDraft();
    const original = root.discussionsStore.selected!;
    const chat = original.selectedChat!;
    chat.composer.setDraft("Keep this draft", "Keep this draft", []);
    const persisted = discussion("pending", "source-a");
    request.mockResolvedValue([{ ...persisted, threads: [], pendingCreation: { clientDraftId: chat.thread.id } }]);

    await root.discussionsStore.load();

    expect(root.discussionsStore.selected).toBe(original);
    expect(original.selectedChat).toBe(chat);
    expect(chat.composer.draft).toBe("Keep this draft");
    expect(root.discussionsStore.entries).toHaveLength(1);
  });
});

/** An inert transport records only explicit application requests. */
function fixture() {
  const request = vi.fn(async (_input: OpenCodexRequest): Promise<unknown> => []);
  const root = new RootStore({ request, onEvent: () => () => undefined });
  roots.push(root);
  root.sourcesStore.sources = [discussionSource("source-a"), discussionSource("source-b")];
  root.appStore.settingsStore.settings.defaultSourceId = "source-a";
  return { root, request };
}

