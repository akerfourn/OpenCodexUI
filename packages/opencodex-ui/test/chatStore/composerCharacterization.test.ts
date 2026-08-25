/** Characterizes the composer contract independently from its owning chat. */
import { describe, expect, it, vi } from "vitest";

import type {
  OpenCodexComposerReference,
  OpenCodexImageAttachment
} from "@open-codex-ui/opencodex-protocol";

import { ChatStore } from "../../src/stores/chat/ChatStore";
import {
  createChatStore,
  createProjectStore,
  createRootStore,
  createThread,
  flushPromises
} from "./chatStoreFixtures";

describe("ChatStore composer characterization", () => {
  it("should isolate composer references and attachments from caller mutations", () => {
    const chatStore = createChatStore({});
    const references: OpenCodexComposerReference[] = [{
      type: "skill",
      name: "review",
      path: "/skills/review"
    }];
    const attachments: OpenCodexImageAttachment[] = [{
      id: "image-1",
      kind: "image",
      source: "localPath",
      value: "/tmp/image.png",
      name: "image.png",
      previewUrl: "file:///tmp/image.png"
    }];

    chatStore.composer.setDraft("draft", "**draft**", references);
    chatStore.composer.addAttachments(attachments);

    references[0]!.path = "/tmp/changed-skill";
    attachments[0]!.value = "/tmp/changed-image.png";
    attachments[0]!.previewUrl = "file:///tmp/changed-image.png";

    expect(chatStore.composer.draftReferences).toEqual([{
      type: "skill",
      name: "review",
      path: "/skills/review"
    }]);
    expect(chatStore.composer.attachments).toEqual([{
      id: "image-1",
      kind: "image",
      source: "localPath",
      value: "/tmp/image.png",
      name: "image.png",
      previewUrl: "file:///tmp/image.png"
    }]);
    expect(chatStore.composer.draftReferences).not.toBe(references);
    expect(chatStore.composer.draftReferences[0]).not.toBe(references[0]);
    expect(chatStore.composer.attachments).not.toBe(attachments);
    expect(chatStore.composer.attachments[0]).not.toBe(attachments[0]);
  });

  it("should reconcile effort and clear an unavailable tier when the model changes", () => {
    const rootStore = createRootStore();
    configureServiceTierLookup(rootStore);
    vi.mocked(rootStore.appStore.resolveReasoningEffort).mockImplementation((model, effort) => {
      if (model === "gpt-5.4-mini" && effort === "xhigh") {
        return "medium";
      }

      return effort;
    });
    const chatStore = new ChatStore(
      createThread({ model: "gpt-5.5", reasoningEffort: "xhigh" }),
      createProjectStore(),
      rootStore
    );

    chatStore.composer.setServiceTier("priority");
    chatStore.composer.setModel("gpt-5.4-mini");

    expect(chatStore.composer.selectedModel).toBe("gpt-5.4-mini");
    expect(chatStore.composer.reasoningEffort).toBe("medium");
    expect(chatStore.composer.selectedServiceTier).toBeNull();
    expect(rootStore.request).toHaveBeenLastCalledWith({
      type: "threads.updateComposerSettings",
      threadId: "thread-1",
      model: "gpt-5.4-mini",
      reasoningEffort: "medium"
    });
  });

  it("should report composer setting failures without rolling back local metadata", async () => {
    const rootStore = createRootStore();
    const requestError = new Error("settings unavailable");
    vi.mocked(rootStore.request).mockRejectedValue(requestError);
    const chatStore = new ChatStore(
      createThread({ model: "gpt-5.5", reasoningEffort: "medium" }),
      createProjectStore(),
      rootStore
    );

    chatStore.composer.setReasoningEffort("high");
    await flushPromises();

    expect(chatStore.composer.reasoningEffort).toBe("high");
    expect(chatStore.thread.reasoningEffort).toBe("high");
    expect(rootStore.appStore.errorMessage).toBe("settings unavailable");
  });

  it("should preserve an explicitly selected service tier across thread metadata refreshes", () => {
    const rootStore = createRootStore();
    configureServiceTierLookup(rootStore);
    const chatStore = new ChatStore(
      createThread({ model: "gpt-5.5", reasoningEffort: "medium" }),
      createProjectStore(),
      rootStore
    );

    chatStore.composer.setServiceTier("priority");
    chatStore.setThread(createThread({ model: "gpt-5.5", reasoningEffort: "low" }));

    expect(chatStore.composer.selectedServiceTier).toBe("priority");
  });

  it("should send structured-clone-compatible composer data", async () => {
    const rootStore = createRootStore();
    const chatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);
    const attachments: OpenCodexImageAttachment[] = [{
      id: "image-1",
      kind: "image",
      source: "dataUrl",
      value: "data:image/png;base64,ZmFrZQ==",
      name: "image.png",
      previewUrl: "data:image/png;base64,ZmFrZQ=="
    }];
    const references: OpenCodexComposerReference[] = [{
      type: "skill",
      name: "review",
      path: "/skills/review"
    }];

    await expect(chatStore.actions.send("hello", attachments, references)).resolves.toBe(true);

    const request = vi.mocked(rootStore.request).mock.calls[0]?.[0];

    if (request === undefined) {
      throw new Error("Expected a turn.start request");
    }

    expect(() => structuredClone(request)).not.toThrow();
    expect(request).toMatchObject({
      type: "turn.start",
      attachments,
      references
    });
  });
});

/** Adds the service-tier lookup omitted by the minimal root-store fixture. */
function configureServiceTierLookup(rootStore: ReturnType<typeof createRootStore>): void {
  rootStore.appStore.models[0]!.serviceTiers = [{
    id: "priority",
    name: "Priority",
    description: ""
  }];
  rootStore.appStore.getServiceTierOptions = (model) => {
    return rootStore.appStore.models.find((entry) => entry.model === model)?.serviceTiers ?? [];
  };
}
