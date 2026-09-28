import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OpenCodexAutoApprovalReview } from "@open-codex-ui/opencodex-protocol";

import { AutoApprovalReviewRow } from "../src/components/messages/AutoApprovalReviewRow";
import { AutoApprovalReviewDetailsDialog } from "../src/components/messages/AutoApprovalReviewDetailsDialog";
import { MessageRow } from "../src/components/messages/MessageRow";
import { createChatStore, createTurn } from "./chatStore/chatStoreFixtures";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@mui/material", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mui/material")>();
  return {
    ...actual,
    // SSR omits portals; keep the dialog's content available for deterministic assertions.
    Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => open ? <div>{children}</div> : null
  };
});

/** Supplies the stable UI contract, independent of Codex's wire representation. */
function review(status: OpenCodexAutoApprovalReview["status"]): OpenCodexAutoApprovalReview {
  return {
    reviewId: "review-1", status, action: "npm install example",
    actionDetails: '{"command":"npm install example","cwd":"/workspace/project"}',
    rationale: "Installation explicitly requested <script>test</script>",
    riskLevel: "low", userAuthorization: null
  };
}

describe("automatic approval review presentation", () => {
  it("should show progress without offering terminal decision details yet", () => {
    const html = renderToStaticMarkup(<AutoApprovalReviewRow review={review("inProgress")} />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("message.autoApprovalReview.status.inProgress");
    expect(html).toContain("npm install example");
    expect(html).not.toContain('aria-label="message.autoApprovalReview.details"');
    expect(html).not.toContain("Installation explicitly requested");
  });

  it.each(["approved", "denied", "timedOut", "aborted", "unknown"] as const)(
    "should render %s as a compact message row with an information button",
    (status) => {
      const html = renderToStaticMarkup(<MessageRow
        item={{ id: "review-1", kind: "autoApprovalReview", role: "activity", content: "fallback",
          createdAt: null, status: "completed", autoApprovalReview: review(status) }}
        isLast={false} lastMessageRef={{ current: null }} onOpenLink={vi.fn()}
      />);
      expect(html).toContain(`message.autoApprovalReview.status.${status}`);
      expect(html).toContain('aria-label="message.autoApprovalReview.details"');
      expect(html).not.toContain('role="progressbar"');
      expect(html).not.toContain("Installation explicitly requested");
    }
  );

  it("should expose the completed rationale and action as inert text in the details", () => {
    const html = renderToStaticMarkup(<AutoApprovalReviewDetailsDialog
      open review={review("denied")} onClose={vi.fn()}
    />);
    expect(html).toContain("message.autoApprovalReview.status.denied");
    expect(html).toContain("Installation explicitly requested &lt;script&gt;test&lt;/script&gt;");
    expect(html).toContain("/workspace/project");
    expect(html).not.toContain("<script>");
  });

  it("should replace the pending snapshot without duplicating the row or appending status text", () => {
    const chat = createChatStore({});
    for (const state of ["inProgress", "denied"] as const) {
      chat.timeline.applyActivityUpdated({
        id: "review-1", threadId: chat.thread.id, title: "turn-1", kind: "autoApprovalReview",
        content: state, status: state === "inProgress" ? "running" : "error",
        autoApprovalReview: review(state)
      }, null, null);
    }
    expect(chat.timeline.turns[0]?.items).toHaveLength(1);
    expect(chat.timeline.turns[0]?.items[0]).toMatchObject({
      content: "denied", status: "error", autoApprovalReview: { status: "denied" }
    });
  });

  it("should preserve a completed turn when a review decision arrives late", () => {
    const chat = createChatStore({});
    chat.timeline.setTurns([createTurn("turn-1", "completed")]);
    chat.timeline.applyActivityUpdated({
      id: "review-1", threadId: chat.thread.id, title: "turn-1", kind: "autoApprovalReview",
      content: "denied", status: "error", autoApprovalReview: review("denied")
    }, null, null);
    expect(chat.timeline.turns[0]?.status).toBe("completed");
    expect(chat.timeline.turns[0]?.items[0]?.autoApprovalReview?.status).toBe("denied");
  });
});
