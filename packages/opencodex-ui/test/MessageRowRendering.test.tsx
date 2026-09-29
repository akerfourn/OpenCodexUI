import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OpenCodexSettings, OpenCodexTurnItem } from "@open-codex-ui/opencodex-protocol";
import { MessageRowX } from "../src/components/messages/MessageRow";
import { MessageRenderingContext } from "../src/components/messages/MessageRenderingContext";
import { MessageRenderingStore } from "../src/stores/chat/MessageRenderingStore";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const context = { sourceId: "source", threadId: "thread" };

/** Renders actual message rows with the same preference context as a conversation. */
function render(store: MessageRenderingStore, role: "user" | "assistant", phase?: "commentary"): string {
  const item = { id: "message", role, phase, content: "**Formula** $x^2$" } as OpenCodexTurnItem;
  return renderToStaticMarkup(
    <MessageRenderingContext.Provider value={{ store, context }}>
      <MessageRowX item={item} turnId="turn" isLast={false} lastMessageRef={createRef<HTMLElement>()}
        onOpenLink={vi.fn()} />
    </MessageRenderingContext.Provider>
  );
}

describe("message row rendering", () => {
  it("should apply different role defaults and expose settings for users, answers and commentary", () => {
    const store = new MessageRenderingStore({ settings: {} as OpenCodexSettings,
      request: async <T,>() => [] as T });
    const user = render(store, "user");
    expect(user).toContain("$x^2$");
    expect(user).not.toContain('class="katex');
    for (const markup of [user, render(store, "assistant"), render(store, "assistant", "commentary")]) {
      expect(markup).toContain('aria-label="messageRendering.title"');
      expect(markup).toContain("<strong>Formula</strong>");
    }
    expect(render(store, "assistant")).toContain('class="katex');
  });

  it("should apply saved per-message Markdown overrides to the actual row without altering copy content", async () => {
    const store = new MessageRenderingStore({ settings: {} as OpenCodexSettings,
      request: async <T,>() => [{ turnId: "turn", itemId: "message", markdown: false, math: null }] as T });
    await store.load(context);
    const markup = render(store, "assistant");
    expect(markup).toContain("**Formula** $x^2$");
    expect(markup).toContain("markdown-message-plain");
    expect(markup).not.toContain('class="katex');
  });
});
