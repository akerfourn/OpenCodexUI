import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type {
  OpenCodexCollaborationEvent,
  OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => {
      if (key === "collaboration.route") {
        return `${values?.sender ?? "?"} -> ${values?.receiver ?? "?"}`;
      }

      return key;
    }
  })
}));

import {
  CollaborationEventCard,
  resolveRelatedThreadId,
  resolveNavigableThreadId
} from "../src/components/messages/CollaborationEventCard";

describe("CollaborationEventCard", () => {
  it("should show an explicit fallback when a historical spawn prompt is unavailable", () => {
    const markup = renderToStaticMarkup(
      <CollaborationEventCard
        event={createEvent({ prompt: null, evidence: ["structuralInference"] })}
        currentThread={createThread("child-1", "Luna")}
        onNavigateThread={vi.fn()}
      />
    );

    expect(markup).toContain("collaboration.instructionUnavailable");
    expect(markup).toContain("root -&gt; Luna");
  });

  it("should bound a long prompt and expose an expansion control", () => {
    const longPrompt = `begin\n${"x".repeat(5_000)}\nend`;
    const markup = renderToStaticMarkup(
      <CollaborationEventCard
        event={createEvent({ prompt: longPrompt })}
        currentThread={createThread("parent-1", "Sol")}
        onNavigateThread={vi.fn()}
      />
    );

    expect(markup).toContain("begin");
    expect(markup).toContain("end");
    expect(markup).toContain("collaboration.showFullContent");
    expect(markup).not.toContain(longPrompt);
  });

  it("should render a dense two-line activity inside reasoning", () => {
    const markup = renderToStaticMarkup(
      <CollaborationEventCard
        event={createEvent({ prompt: "first\nsecond\nthird" })}
        currentThread={createThread("parent-1", "Sol")}
        displayMode="embedded"
        onNavigateThread={vi.fn()}
      />
    );

    expect(markup).toContain('data-collaboration-display="embedded"');
    expect(markup).toContain('data-collaboration-prompt="true"');
    expect(markup).toContain("collaboration.showFullContentCompact");
    expect(markup).toContain("collaboration.openSubAgentChatCompact");
  });

  it("should navigate to the other side of a source-scoped relationship", () => {
    const event = createEvent();

    expect(resolveRelatedThreadId(event, "parent-1")).toBe("child-1");
    expect(resolveRelatedThreadId(event, "child-1")).toBe("parent-1");
  });

  it("should hide root navigation when only descendants are inspectable", () => {
    const event = createEvent();

    expect(resolveNavigableThreadId(event, "child-1", ["child-1", "child-2"]))
      .toBeNull();
    expect(resolveNavigableThreadId(event, "parent-1", ["child-1", "child-2"]))
      .toBe("child-1");
  });

  it("should avoid choosing an arbitrary target for a multi-agent event", () => {
    const event = createEvent({ receiverThreadIds: ["child-1", "child-2"] });

    expect(resolveRelatedThreadId(event, "parent-1")).toBeNull();
  });
});

/** Creates a normalized collaboration event fixture. */
function createEvent(
  overrides: Partial<OpenCodexCollaborationEvent> = {}
): OpenCodexCollaborationEvent {
  return {
    id: "event-1",
    sourceId: "source-1",
    threadId: "parent-1",
    turnId: "turn-1",
    callId: "call-1",
    action: "spawn",
    toolName: "spawn_agent",
    senderThreadId: "parent-1",
    senderAgentPath: "/root",
    receiverThreadIds: ["child-1"],
    receiverAgentPaths: ["/root/reviewer"],
    prompt: "Review this module.",
    result: null,
    taskName: "review",
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    agentRole: "reviewer",
    forkTurns: "all",
    status: "completed",
    targetAgentStatuses: {},
    evidence: ["rawFunctionCall"],
    ...overrides
  };
}

/** Creates the thread metadata needed to label one side of a card. */
function createThread(id: string, nickname: string): OpenCodexThread {
  return {
    id,
    sessionId: null,
    parentThreadId: id === "child-1" ? "parent-1" : null,
    codexTitle: nickname,
    customTitle: null,
    title: nickname,
    preview: "",
    model: null,
    reasoningEffort: null,
    projectName: "project-1",
    projectPath: "/workspace/project-1",
    sourceId: "source-1",
    branchName: null,
    updatedAt: null,
    isArchived: false,
    threadSource: null,
    agentNickname: nickname,
    agentRole: null,
    subAgentSource: null,
    canAcceptDirectInput: null
  };
}
