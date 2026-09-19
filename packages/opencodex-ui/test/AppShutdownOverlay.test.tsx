import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

import { AppShutdownOverlay } from "../src/components/app/AppShutdownOverlay";

describe("AppShutdownOverlay", () => {
  it("should leave the application unobstructed when no operation is running", () => {
    const markup = renderToStaticMarkup(<AppShutdownOverlay open={false} />);
    expect(markup).not.toContain('role="progressbar"');
  });
  it("should show installation progress without claiming a download percentage", () => {
    const markup = renderToStaticMarkup(<AppShutdownOverlay open mode="update" />);
    expect(markup).toContain("updates.installing");
    expect(markup).toContain("updates.installingDetail");
    expect(markup).toContain('role="progressbar"');
    expect(markup).not.toContain("shutdown.title");
    expect(markup).not.toContain("aria-valuenow");
  });
  it("should expose localized shutdown progress when open", () => {
    const markup = renderToStaticMarkup(<AppShutdownOverlay open />);

    expect(markup).toContain("shutdown.title");
    expect(markup).toContain("shutdown.detail");
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('role="status"');
  });
});
