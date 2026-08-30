import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

import { AppShutdownOverlay } from "../src/components/app/AppShutdownOverlay";

describe("AppShutdownOverlay", () => {
  it("should expose localized shutdown progress when open", () => {
    const markup = renderToStaticMarkup(<AppShutdownOverlay open />);

    expect(markup).toContain("app.shutdown.title");
    expect(markup).toContain("app.shutdown.detail");
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('role="status"');
  });
});
