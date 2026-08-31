import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import type { RootStore } from "../src/stores/RootStore";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock("@mui/material", async () => {
  const actual = await vi.importActual<typeof import("@mui/material")>("@mui/material");

  return {
    ...actual,
    Dialog: ({
      open,
      children
    }: {
      open: boolean;
      children: ReactNode;
    }) => open ? <div data-testid="dialog">{children}</div> : null
  };
});

import { AppCloseConfirmationDialog } from "../src/components/app/AppCloseConfirmationDialog";

describe("AppCloseConfirmationDialog", () => {
  it("should render the active-turn and project-activity warnings", () => {
    const markup = renderToStaticMarkup(
      <AppCloseConfirmationDialog
        store={createStore({ hasActiveTurns: true, hasPendingProjectActivity: true })}
      />
    );

    expect(markup).toContain("closeConfirmation.title");
    expect(markup).toContain("closeConfirmation.activeTurns");
    expect(markup).toContain("closeConfirmation.pendingProjectActivity");
    expect(markup).toContain("common.cancel");
    expect(markup).toContain("closeConfirmation.quitAnyway");
  });

  it("should stay closed when no native close request is pending", () => {
    const markup = renderToStaticMarkup(
      <AppCloseConfirmationDialog store={createStore(null)} />
    );

    expect(markup).toBe("");
  });
});

/** Creates the minimal root-store surface consumed by the dialog. */
function createStore(
  applicationCloseRequest: RootStore["applicationCloseRequest"]
): RootStore {
  return {
    applicationCloseRequest,
    respondToApplicationClose: vi.fn()
  } as unknown as RootStore;
}
