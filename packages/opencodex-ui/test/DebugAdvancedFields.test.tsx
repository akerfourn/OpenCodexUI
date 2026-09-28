import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { describe, expect, it, vi } from "vitest";
import { DebugAdvancedFields } from "../src/components/debug/DebugAdvancedFields";
import { createDebugAdvancedDraft } from "../src/stores/debug/debugAdvancedDraft";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe("advanced debug fields", () => {
  it.each(["light", "dark"] as const)("should expose Node fields without eagerly loading Monaco in %s mode", mode => {
    const draft = createDebugAdvancedDraft({ env: { MODE: "test" }, envFile: ".env", stopOnEntry: true });
    const html = renderToStaticMarkup(<ThemeProvider theme={createTheme({ palette: { mode } })}>
      <DebugAdvancedFields draft={draft} target="node" request="launch" onChange={vi.fn()} />
    </ThemeProvider>);
    expect(html).toContain("debug.advanced.title");
    expect(html).toContain("debug.advanced.runtimeArgs");
    expect(html).toContain("debug.advanced.stopOnEntry");
    expect(html).toContain(".env");
    expect(html).not.toContain("monaco-editor");
  });

  it("should explain incompatible retained fields after a mode switch instead of discarding them", () => {
    const html = renderToStaticMarkup(<DebugAdvancedFields
      draft={createDebugAdvancedDraft({ envFile: ".env" })} target="node" request="attach" onChange={vi.fn()} />);
    expect(html).toContain("debug.advanced.nodeOnly");
    expect(html).toContain("debug.advanced.clearNode");
    expect(html).not.toContain("debug.advanced.runtimeArgs");
  });
});
