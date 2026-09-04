import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

import { PlanActivityRow } from "../src/components/messages/PlanActivityRow";
import { MessageRow } from "../src/components/messages/MessageRow";

describe("PlanActivityRow", () => {
  it("should render structured plan steps as a non-interactive checklist", () => {
    const markup = renderToStaticMarkup(
      <PlanActivityRow
        icon={<span>PLAN_ICON</span>}
        plan={{
          explanation: "Ordre de travail",
          steps: [
            { step: "Analyser", status: "completed" },
            { step: "Implémenter", status: "inProgress" },
            { step: "Valider", status: "pending" }
          ]
        }}
      />
    );

    expect(markup).toContain("Ordre de travail");
    expect(markup).toContain("Analyser");
    expect(markup).toContain("Implémenter");
    expect(markup).toContain("Valider");
    expect(markup).toContain("message.planStatus.completed");
    expect(markup).toContain("message.planStatus.inProgress");
    expect(markup).toContain("message.planStatus.pending");
    expect(markup).toContain('role="progressbar"');
    expect(markup).not.toContain('type="checkbox"');
  });

  it("should leave historical text-only plans on the generic Markdown path", () => {
    const markup = renderToStaticMarkup(
      <MessageRow
        item={{
          id: "legacy-plan",
          role: "activity",
          kind: "plan",
          content: "completed: Analyser\npending: Implémenter",
          status: "completed",
          createdAt: null
        }}
        isLast={false}
        lastMessageRef={{ current: null }}
        onOpenLink={vi.fn()}
      />
    );

    expect(markup).toContain("completed: Analyser");
    expect(markup).toContain("pending: Implémenter");
    expect(markup).not.toContain("message.planSteps");
  });
});
