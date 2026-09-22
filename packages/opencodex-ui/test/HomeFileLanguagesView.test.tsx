import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HomeFileLanguagesView } from "../src/components/home/HomeFileLanguagesView";
import { FileLanguagesStore } from "../src/stores/files/FileLanguagesStore";
import type { RootStore } from "../src/stores/RootStore";
import type { OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe("Home syntax catalogue", () => {
  it("should limit initial language controls while preserving search and preference errors", () => {
    const languages = new FileLanguagesStore({ settings: {} as OpenCodexSettings, request: vi.fn() });
    languages.error = "Disk full";
    const markup = renderToStaticMarkup(<HomeFileLanguagesView
      store={{ fileLanguagesStore: languages } as RootStore} />);
    expect(markup).toContain("home.fileLanguages");
    expect(markup).toContain("fileLanguages.search");
    expect(markup.match(/<li\b/g)).toHaveLength(30);
    expect(markup).toContain("fileLanguages.showMore");
    expect(markup).not.toContain(">TOML<");
    expect(markup).toContain("fileLanguages.saveError");
    expect(markup).toContain("Disk full");
  });
});
