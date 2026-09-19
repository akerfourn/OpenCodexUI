import { runInAction } from "mobx";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatComposerX } from "../src/components/chat/ChatComposer";
import { getDropTarget } from "../src/components/app/AppFileDropOverlay";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenCodexProject, OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";
import { RootStore } from "../src/stores/RootStore";
import { createThread } from "./chatStore/chatStoreFixtures";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

/** Controlled backend replies without timers or external services. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

/** Exercises the real project, composer, event router and source-aware chat index. */
function fixture() {
  const request = vi.fn(async (input: OpenCodexRequest): Promise<unknown> => {
    if (input.type === "threads.create") {
      return { thread: createThread({ id: "codex-thread", sourceId: "source", projectPath: "/B" }), turns: [] };
    }
    if (input.type === "turn.start") return { turnId: "turn-1" };
    return [];
  });
  const root = new RootStore({ request, onEvent: () => () => undefined });
  const project = root.projectsStore.openProjectTab({
    id: "project", path: "/A", sourceId: "source", defaultName: "Project", displayName: null,
    preferences: {}, isHidden: false, createdAt: "", updatedAt: "", editedAt: "", lastSeenAt: ""
  } as OpenCodexProject, false);
  vi.spyOn(root.sourcesStore, "isSourceReady").mockReturnValue(true);
  runInAction(() => { project.workspaces.workspaces = [
    { id: "A", projectId: "project", sourceId: "source", path: "/A", isPrimary: true, managed: false, removedAt: null },
    { id: "B", projectId: "project", sourceId: "source", path: "/B", isPrimary: false, managed: true, removedAt: null }
  ]; });
  request.mockClear();
  project.threadListStore.createThread("B");
  const chat = project.selectedChat!;
  chat.composer.setDraft("A long message", "A **long** message", [{ type: "file", name: "README", path: "/B/README.md" }]);
  chat.composer.addAttachments([{ id: "file", kind: "file", source: "dataUrl", name: "notes.txt", value: "data:application/octet-stream;base64,WA==" }]);
  return { root, project, chat, request };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-19T10:00:00Z"));
  let sequence = 0;
  vi.spyOn(crypto, "randomUUID").mockImplementation(() => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("deferred conversation creation", () => {
  it("should show readonly input and a loading send button while rejecting pasted or dropped attachments", async () => {
    const { root, project, chat, request } = fixture();
    const creation = deferred<unknown>();
    request.mockReturnValueOnce(creation.promise);
    const submission = chat.composer.submit();
    const markup = renderToStaticMarkup(createElement(ChatComposerX, {
      store: root, projectStore: project, chatStore: chat, modelOptions: [], isWorking: false
    }));
    expect(markup).toContain('contenteditable="false"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('role="progressbar"');
    const targetStore = { activeProjectStore: project, activeChatStore: chat, appStore: { isShuttingDown: false, shouldShowOnboarding: false } } as RootStore;
    expect(getDropTarget(targetStore)).toBeNull();
    creation.reject(new Error("Offline"));
    await submission;
    expect(getDropTarget(targetStore)).toBe(chat.composer);
  });

  it("should preserve an existing chat's draft when a later send fails", async () => {
    const { project, chat, request } = fixture();
    project.drafts.adopt(chat.thread.id, createThread({ id: "existing", sourceId: "source", projectPath: "/B" }));
    const turn = deferred<unknown>();
    request.mockReturnValueOnce(turn.promise);
    const submission = chat.composer.submit();
    chat.applyTurnStarted("early-turn");
    chat.applyTurnCompleted("early-turn", 1, "completed");
    expect(chat.composer.isSubmitting).toBe(true);
    expect(chat.composer.draft).toBe("A long message");
    await expect(chat.actions.send("duplicate")).resolves.toBe(false);
    turn.reject(new Error("Turn rejected"));
    await expect(submission).resolves.toBe(false);
    expect(chat.composer.isSubmitting).toBe(false);
    expect(chat.composer.draftMarkdown).toBe("A **long** message");
    expect(chat.composer.draftReferences).toHaveLength(1);
    expect(chat.composer.attachments).toHaveLength(1);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("should keep opening, editing and refreshing an unsent chat entirely local", async () => {
    const { project, chat, request } = fixture();
    const localId = chat.thread.id;
    project.openThread(localId);
    chat.composer.setModel("luna");
    await chat.goal.load();
    chat.actions.refresh();
    chat.actions.review();
    chat.actions.compact();
    project.threadListStore.setThreads([]);

    expect(request).not.toHaveBeenCalled();
    expect(chat.codexThreadId).toBeNull();
    expect(project.threadListStore.threads.map((thread) => thread.id)).toEqual([localId]);
    expect(chat.composer.draft).toBe("A long message");
  });

  it("should wait for acceptance before clearing and keep the same composer when binding", async () => {
    const { project, chat, request } = fixture();
    const creation = deferred<{ thread: ReturnType<typeof createThread> }>();
    const turn = deferred<{ turnId: string }>();
    request.mockReturnValueOnce(creation.promise).mockReturnValueOnce(turn.promise);
    const localId = chat.thread.id;
    const submission = chat.composer.submit();
    expect(chat.composer.isSubmitting).toBe(true);
    expect(chat.composer.draft).toBe("A long message");
    expect(request).toHaveBeenCalledWith({ type: "threads.create", clientDraftId: localId,
      sourceId: "source", projectPath: "/B", workspaceId: "B" });
    await expect(chat.composer.submit()).resolves.toBe(false);
    chat.composer.setDraft("overwrite", "overwrite", []);
    chat.composer.removeAttachment("file");
    chat.composer.addAttachments([{ id: "late", kind: "image", source: "localPath", value: "/late.png" }]);
    expect(chat.composer.draft).toBe("A long message");
    expect(chat.composer.attachments).toHaveLength(1);

    creation.resolve({ thread: createThread({ id: "real", sourceId: "source", projectPath: "/B" }) });
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ type: "turn.start", threadId: "real" })));
    expect(project.selectedChat).toBe(chat);
    expect(chat.viewId).toBe(localId);
    expect(chat.composer.isSubmitting).toBe(true);
    expect(chat.composer.draftReferences).toHaveLength(1);
    const sent = request.mock.calls.find(([input]) => input.type === "turn.start")![0];
    expect(() => structuredClone(sent)).not.toThrow();
    expect(sent).toMatchObject({ projectPath: "/B", sourceId: "source", text: "A **long** message" });
    turn.resolve({ turnId: "accepted" });
    await expect(submission).resolves.toBe(true);
    expect(chat.composer.isSubmitting).toBe(false);
    expect(chat.composer.draft).toBe("");
    expect(chat.composer.attachments).toEqual([]);
    expect(chat.runtime.isWorking).toBe(true);
    chat.dispose();
  });

  it("should retain the complete draft after creation fails and allow another attempt", async () => {
    const { chat, request } = fixture();
    request.mockRejectedValueOnce(new Error("Connection failed"));
    await expect(chat.composer.submit()).resolves.toBe(false);
    expect(chat.codexThreadId).toBeNull();
    expect(chat.composer.isSubmitting).toBe(false);
    expect(chat.composer.draftMarkdown).toBe("A **long** message");
    expect(chat.composer.draftReferences).toHaveLength(1);
    expect(chat.composer.attachments).toHaveLength(1);
    await expect(chat.composer.submit()).resolves.toBe(true);
    chat.dispose();
  });

  it("should retain a confirmed remote id when the first turn fails and reuse it on retry", async () => {
    const { root, project, chat, request } = fixture();
    const localId = chat.thread.id;
    request.mockImplementationOnce(async () => {
      const thread = createThread({ id: "real", sourceId: "source", projectPath: "/B" });
      root.handleEvent({ type: "thread.created", clientDraftId: localId, thread, turns: [] });
      return { thread };
    }).mockRejectedValueOnce(new Error("Turn rejected"));
    await expect(chat.composer.submit()).resolves.toBe(false);
    expect(chat.codexThreadId).toBe("real");
    expect(root.projectsStore.findChatStoreByThreadId("real", "source")).toBe(chat);
    expect(root.projectsStore.findChatStoreByThreadId(localId, "source")).toBeNull();
    project.threadListStore.setThreads([]);
    expect(project.threadListStore.threads.map((thread) => thread.id)).toEqual(["real"]);
    expect(chat.composer.draftMarkdown).toBe("A **long** message");
    expect(chat.composer.attachments).toHaveLength(1);
    expect(chat.timeline.turns).toHaveLength(0);
    await expect(chat.composer.submit()).resolves.toBe(true);
    expect(request.mock.calls.filter(([input]) => input.type === "threads.create")).toHaveLength(1);
    chat.dispose();
  });

  it("should bind an early creation event without stealing another draft's selection", async () => {
    const { root, project, chat, request } = fixture();
    const creation = deferred<unknown>();
    request.mockReturnValueOnce(creation.promise);
    const localId = chat.thread.id;
    const submission = chat.composer.submit();
    project.threadListStore.createThread("A");
    const secondChat = project.selectedChat!;
    const thread = createThread({ id: "real", sourceId: "source", projectPath: "/B" });
    root.handleEvent({ type: "thread.created", clientDraftId: localId, thread, turns: [] });
    creation.reject(new Error("Reply lost"));
    await expect(submission).resolves.toBe(false);
    expect(project.selectedChat).toBe(secondChat);
    expect(chat.codexThreadId).toBe("real");
    expect(chat.composer.draft).toBe("A long message");
    await expect(chat.composer.submit()).resolves.toBe(true);
    expect(request.mock.calls.filter(([input]) => input.type === "threads.create")).toHaveLength(1);
    expect(secondChat.codexThreadId).toBeNull();
    chat.dispose();
  });

  it("should switch workspace and delete a local draft without backend mutations", async () => {
    const { project, chat, request } = fixture();
    await project.workspaces.select("A");
    expect(chat.thread.projectPath).toBe("/A");
    project.threadListStore.deleteThread(chat.thread.id);
    expect(project.selectedChat).toBeNull();
    expect(project.drafts.threads).toEqual([]);
    project.threadListStore.setThreads([]);
    expect(project.threadListStore.threads).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });
});
