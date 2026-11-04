import { describe, expect, it, vi } from "vitest";

import type { OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";
import type { ProjectStore } from "../src/stores/project/ProjectStore";
import type { RootStore } from "../src/stores/RootStore";
import { ThreadRepairStore } from "../src/stores/chat/ThreadRepairStore";

/** Controls transport completion without timers, network access or source mutations. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(complete => { resolve = complete; });
  return { promise, resolve };
}

/** Provides explicit UI flags; the real repair store owns all orchestration. */
function fixture() {
  const chat = {
    isLocalDraft: false, composer: { isSubmitting: false, draft: "Keep this message" },
    runtime: { isWorking: true }
  };
  const project = {
    selectedChatId: "blocked", isReadOnlyFromCache: false,
    chatsById: new Map([["blocked", chat]]), workspaces: { isBusy: false, error: "Unrelated error" }
  };
  const request = vi.fn(async (_input: OpenCodexRequest): Promise<unknown> => ({ ok: true }));
  const root = { request } as unknown as RootStore;
  const store = new ThreadRepairStore("blocked", "source", project as unknown as ProjectStore, root);
  return { store, request, project, chat, root };
}

describe("explicit conversation repair", () => {
  it("should verify before refreshing the original thread and prevent duplicate attempts", async () => {
    const { store, request, project, chat } = fixture();
    const verification = deferred();
    request.mockImplementation(async input => {
      if (input.type === "threads.workspace.reconcile") await verification.promise;
      return { ok: true };
    });

    const repair = store.repair();
    await store.repair();
    project.selectedChatId = "another-chat";
    expect(store.isBusy).toBe(true);
    expect(request.mock.calls.map(([input]) => structuredClone(input))).toEqual([
      { type: "threads.workspace.reconcile", threadId: "blocked" }
    ]);

    verification.resolve();
    await repair;
    expect(request.mock.calls.map(([input]) => structuredClone(input))).toEqual([
      { type: "threads.workspace.reconcile", threadId: "blocked" },
      { type: "threads.recover", threadId: "blocked" }
    ]);
    expect(store.isComplete).toBe(true);
    expect(store.isBusy).toBe(false);
    expect(chat.composer.draft).toBe("Keep this message");
    expect(project.workspaces.error).toBe("Unrelated error");
  });

  it("should retain a source refusal locally without refreshing or claiming success", async () => {
    const { store, request } = fixture();
    request.mockRejectedValueOnce(new Error("Thread is active or its execution status is unknown."));
    await store.repair();
    expect(store.error).toBe("Thread is active or its execution status is unknown.");
    expect(store.isReconciled).toBe(false);
    expect(store.isComplete).toBe(false);
    expect(store.canRepair).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("should retry only refresh when reconciliation succeeded but the refresh response failed", async () => {
    const { store, request } = fixture();
    request.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Source disconnected"));
    await store.repair();
    expect(store.isReconciled).toBe(true);
    expect(store.isComplete).toBe(false);
    expect(store.error).toBe("Source disconnected");

    await store.repair();
    expect(request.mock.calls.map(([input]) => input.type)).toEqual([
      "threads.workspace.reconcile", "threads.recover", "threads.recover"
    ]);
    expect(store.isComplete).toBe(true);
    expect(store.error).toBeNull();
  });

  it.each(["draft", "submitting", "offline", "workspaceBusy", "orphan"])(
    "should refuse unavailable local repair before contacting transport: %s", async condition => {
      const { store: initial, request, project, chat, root } = fixture();
      if (condition === "draft") chat.isLocalDraft = true;
      if (condition === "submitting") chat.composer.isSubmitting = true;
      if (condition === "offline") project.isReadOnlyFromCache = true;
      if (condition === "workspaceBusy") project.workspaces.isBusy = true;
      let store = initial;
      if (condition === "orphan") store = new ThreadRepairStore("blocked", null, project as unknown as ProjectStore, root);
      await store.repair();
      expect(store.canRepair).toBe(false);
      expect(request).not.toHaveBeenCalled();
    }
  );

  it("should avoid reopening a closed project when verification finishes after disposal", async () => {
    const { store, request } = fixture();
    const verification = deferred();
    request.mockImplementation(async () => verification.promise);
    const repair = store.repair();
    store.dispose();
    verification.resolve();
    await repair;
    expect(store.isReconciled).toBe(true);
    expect(store.isComplete).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
