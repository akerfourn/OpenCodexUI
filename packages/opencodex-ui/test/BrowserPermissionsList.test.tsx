import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BrowserPermissionsList } from "../src/components/browser/BrowserPermissionsList";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe("BrowserPermissionsList", () => {
  it("should keep inherited global rules visible without offering chat-level edits", () => {
    const markup = renderToStaticMarkup(<BrowserPermissionsList busy={false}
      entries={[{ resource: "origins", pattern: "https://pro.easyeda.com", decision: "denied" }]} />);
    expect(markup).toContain("https://pro.easyeda.com");
    expect(markup).toContain("browserPermissions.denied");
    expect(markup).not.toContain("browserPermissions.reset");
    expect(markup).not.toContain('role="combobox"');
  });

  it("should expose both decision editing and reset for the selected scope", () => {
    const markup = renderToStaticMarkup(<BrowserPermissionsList busy={false} onChange={vi.fn()}
      entries={[{ resource: "origins", pattern: "https://site.example", decision: "allowed" }]} />);
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain("browserPermissions.reset");
    expect(markup).toContain("https://site.example");
  });
});
