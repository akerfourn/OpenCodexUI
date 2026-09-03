import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

import { TurnErrorRow } from "../src/components/messages/TurnErrorRow";

describe("TurnErrorRow", () => {
  it("should expose the turn diagnostic action in developer mode", () => {
    const markup = renderToStaticMarkup(
      <TurnErrorRow
        message="The turn failed."
        showTurnDiagnostic
        onOpenTurnDiagnostic={vi.fn()}
      />
    );

    expect(markup).toContain('data-testid="BugReportOutlinedIcon"');
    expect(markup).toContain('aria-label="turnDiagnostics.title"');
  });

  it("should hide the diagnostic action outside developer mode", () => {
    const markup = renderToStaticMarkup(
      <TurnErrorRow message="The turn failed." />
    );

    expect(markup).not.toContain('data-testid="BugReportOutlinedIcon"');
  });
});
