// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectGitSyncFieldsX } from "../src/components/projects/ProjectGitSyncFields";
import { frGitSync } from "../src/i18n/locales/fr/gitSync";
import { enGitSync } from "../src/i18n/locales/en/gitSync";
import { frGit } from "../src/i18n/locales/fr/git";
import { createGitSyncStoreFixture } from "./ProjectGitSyncStore.fixture";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Git vocabulary", () => {
  it.each([
    { vocabulary: "simple" as const, label: "Réorganiser" },
    { vocabulary: "technical" as const, label: "Rebase" }
  ])("should use a short $vocabulary label and explain it with a tooltip", async ({ vocabulary, label }) => {
    const language = createInstance();
    await language.init({ lng: "fr", resources: { fr: { translation: { ...frGit, ...frGitSync } } } });
    const test = createGitSyncStoreFixture();
    Object.assign(test.root.appStore.settingsStore.settings, { versioningVocabulary: vocabulary });
    await act(async () => root.render(<I18nextProvider i18n={language}><ProjectGitSyncFieldsX sync={test.sync} /></I18nextProvider>));
    const option = [...document.querySelectorAll("span")].find(item => item.textContent === label);
    expect(option).toBeDefined();
    await act(async () => {
      option!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(frGitSync.gitSync.rebaseHelp);
  });

  it("should retain accented labels and ordinary punctuation in the translated vocabulary", () => {
    expect(frGitSync.gitSync.open).toBe("Synchronisation avancée…");
    expect(frGitSync.gitSync.favoriteAction).toBe("Utiliser {{name}} par défaut");
    expect(enGitSync.gitSync.open).toBe("Advanced synchronization…");
    expect(frGit.git.simple.pushChanges_other).toBe("Envoyer {{count}} enregistrements ↑");
  });
});
