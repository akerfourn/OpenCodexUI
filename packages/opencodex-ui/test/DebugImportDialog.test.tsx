import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RootStore } from "../src/stores/RootStore";
import { DebugImportStore } from "../src/stores/debug/DebugImportStore";
import { DebugImportDialog } from "../src/components/debug/DebugImportDialog";
import { DebugConfigurationDialog } from "../src/components/debug/DebugConfigurationDialog";

vi.mock("react-i18next", () => ({ useTranslation: () => ({
  t: (key: string, options?: { field?: string }) => `${key} ${options?.field ?? ""}`.trim()
}) }));
vi.mock("@mui/material", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mui/material")>();
  return { ...actual, Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div> };
});

const context = { sourceId: "local", projectId: "project", workspaceId: "main", workspacePath: "/project" };

describe("debug import dialogs", () => {
  it("should label a partial profile and show the ignored task before continuing", () => {
    const root = new RootStore({ request: vi.fn(), onEvent: () => () => undefined });
    const store = new DebugImportStore(root, context);
    store.preview = { entries: [{ name: "Node", configuration: {
      id: "draft", name: "Node", context, adapter: "javascript", target: "node", request: "launch", program: "main.js"
    }, issues: [{ kind: "ignored", field: "preLaunchTask" }] }], issues: [] };
    const html = renderToStaticMarkup(<DebugImportDialog store={store} debug={root.debugStore} onClose={vi.fn()} />);
    expect(html).toContain("debug.import.partial");
    expect(html).toContain("preLaunchTask");
    expect(html).toContain("debug.import.review");
    expect(html).not.toContain("debug.start");
  });

  it("should preserve import warnings and expose browser arguments in the final edit form", () => {
    const root = new RootStore({ request: vi.fn(), onEvent: () => () => undefined });
    const html = renderToStaticMarkup(<DebugConfigurationDialog store={root.debugStore} context={context}
      configuration={{ id: "draft", name: "Chrome", adapter: "javascript", target: "chrome", request: "launch",
        context, url: "http://localhost:3000", args: ["--disable-extensions"] }}
      importIssues={[{ kind: "ignored", field: "serverReadyAction" }]} onClose={vi.fn()} />);
    expect(html).toContain("serverReadyAction");
    expect(html).toContain("debug.browserArguments");
    expect(html).toContain("--disable-extensions");
  });
});
