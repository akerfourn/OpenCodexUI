// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceOperationError } from "../src/components/projects/WorkspaceOperationError";
import { frWorkspaces } from "../src/i18n/locales/fr/workspaces";
import { enWorkspaces } from "../src/i18n/locales/en/workspaces";

const message = "Finish active conversations and sub-agents on this source before workspace maintenance.";
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

/** Uses real translations while isolating the source's original diagnostic. */
async function renderError(value: string | null, language = "fr"): Promise<void> {
  const i18n = createInstance();
  await i18n.init({ lng: language, resources: {
    fr: { translation: frWorkspaces }, en: { translation: enWorkspaces }
  } });
  await act(async () => root.render(
    <I18nextProvider i18n={i18n}><WorkspaceOperationError message={value} /></I18nextProvider>
  ));
}

describe("workspace source-activity explanations", () => {
  it.each([
    { language: "fr", text: frWorkspaces.workspaces.sourceActive },
    { language: "en", text: enWorkspaces.workspaces.sourceActive }
  ])("should explain the shared-source restriction in $language", async ({ language, text }) => {
    const diagnostic = `Error invoking remote method 'opencodex:request': Error: ${message}`;
    await renderError(diagnostic, language);

    expect(container.querySelector('[role="alert"] p')?.textContent).toBe(text);
    const details = container.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(details.querySelector("pre")?.textContent).toBe(diagnostic);
  });

  it("should recognize the backend diagnostic without an Electron transport wrapper", async () => {
    await renderError(message);
    expect(container.querySelector('[role="alert"] p')?.textContent).toBe(frWorkspaces.workspaces.sourceActive);
  });

  it("should retain unfamiliar failures without misdiagnosing them as source activity", async () => {
    await renderError("The workspace contains untracked files.");
    expect(container.querySelector('[role="alert"] p')?.textContent).toBe("The workspace contains untracked files.");
    expect(container.querySelector("details")).toBeNull();
  });

  it("should leave successful operations without an error alert", async () => {
    await renderError(null);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
