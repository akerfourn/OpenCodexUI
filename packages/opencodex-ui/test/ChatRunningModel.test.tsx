/** Covers model visibility independently of the editable next-turn selection. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ChatRunningModelX } from "../src/components/chat/ChatRunningModel";
import { ChatStore } from "../src/stores/chat/ChatStore";
import { createChatStore, createProjectStore, createRootStore, createThread, createTurn } from "./chatStore/chatStoreFixtures";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, values?: { model: string }) => `${key} ${values?.model ?? ""}` })
}));

describe("ChatRunningModel", () => {
  it("should keep the submitted model visible when the next-turn selection changes", async () => {
    const root = createRootStore();
    const chat = new ChatStore(createThread({ model: "submitted-model" }), createProjectStore(), root);
    vi.mocked(root.request).mockResolvedValueOnce({ turnId: "running-turn" });
    await expect(chat.actions.send("hello")).resolves.toBe(true);

    chat.composer.setModel("next-model");
    const markup = renderToStaticMarkup(createElement(ChatRunningModelX, { chatStore: chat }));

    expect(markup).toContain("composer.runningModelRequested submitted-model");
    expect(markup).not.toContain("next-model");
    expect(chat.timeline.turns[0]?.execution?.requestedModel).toBe("submitted-model");
    chat.dispose();
  });

  it("should keep request metadata through a snapshot without execution settings", async () => {
    const root = createRootStore();
    const chat = new ChatStore(createThread({ model: "submitted-model" }), createProjectStore(), root);
    vi.mocked(root.request).mockResolvedValueOnce({ turnId: "running-turn" });
    await chat.actions.send("hello");
    chat.timeline.applyTurnsSynced([createTurn("running-turn", "running")], false);

    expect(renderToStaticMarkup(createElement(ChatRunningModelX, { chatStore: chat })))
      .toContain("composer.runningModelRequested submitted-model");
    chat.dispose();
  });

  it("should show unknown for a recovered turn without model metadata", () => {
    const chat = createChatStore({ model: "next-model" });
    chat.timeline.setTurns([createTurn("recovered-turn", "running")]);
    chat.runtime.isWorking = true;
    chat.runtime.activeTurnId = "recovered-turn";

    const markup = renderToStaticMarkup(createElement(ChatRunningModelX, { chatStore: chat }));
    expect(markup).toContain("composer.runningModelUnknown");
    expect(markup).not.toContain("next-model");
    chat.dispose();
  });

  it("should show no running-model label after completion", () => {
    const chat = createChatStore({ model: "next-model" });
    expect(renderToStaticMarkup(createElement(ChatRunningModelX, { chatStore: chat }))).toBe("");
    chat.dispose();
  });

  it("should use a recovered turn's recorded model when no request was captured", () => {
    const chat = createChatStore({ model: "next-model" });
    const turn = createTurn("recovered-turn", "running");
    turn.execution = {
      requestedModel: null, effectiveModel: "recorded-model", requestedReasoningEffort: null,
      effectiveReasoningEffort: null, serviceTier: null
    };
    chat.timeline.setTurns([turn]);
    chat.runtime.isWorking = true;
    chat.runtime.activeTurnId = turn.id;

    expect(renderToStaticMarkup(createElement(ChatRunningModelX, { chatStore: chat })))
      .toContain("composer.runningModelRecorded recorded-model");
    chat.dispose();
  });

  it("should show a recorded reroute instead of presenting the requested model as used", () => {
    const chat = createChatStore({ model: "next-model" });
    const turn = createTurn("recovered-turn", "running");
    turn.execution = {
      requestedModel: "requested-model", effectiveModel: "rerouted-model", requestedReasoningEffort: null,
      effectiveReasoningEffort: null, serviceTier: null
    };
    chat.timeline.setTurns([turn]);
    chat.runtime.isWorking = true;
    chat.runtime.activeTurnId = turn.id;

    expect(renderToStaticMarkup(createElement(ChatRunningModelX, { chatStore: chat })))
      .toContain("composer.runningModelChanged rerouted-model");
    chat.dispose();
  });
});
