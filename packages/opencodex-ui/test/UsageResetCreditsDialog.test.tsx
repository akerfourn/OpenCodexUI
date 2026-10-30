// @vitest-environment jsdom
import { createInstance } from "i18next";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OpenCodexUsageLimits, OpenCodexUsageResetConsumeResult } from "@open-codex-ui/opencodex-protocol";

import { UsageResetCreditsDialogX } from "../src/components/home/UsageResetCreditsDialog";
import { enSources } from "../src/i18n/locales/en/sources";
import { frSources } from "../src/i18n/locales/fr/sources";

const translations = createInstance();
await translations.init({ lng: "fr", resources: { fr: { translation: frSources }, en: { translation: enSources } },
  interpolation: { escapeValue: false } });
let root: Root;
let container: HTMLDivElement;

/** Renders the actual reset flow with isolated backend and external-link effects. */
async function renderDialog(language = "fr", remaining = 90, error: string | null = null) {
  await translations.changeLanguage(language);
  const onOpenHelp = vi.fn();
  const onConsume = vi.fn(async (): Promise<OpenCodexUsageResetConsumeResult> => ({ outcome: "reset" }));
  const usage: OpenCodexUsageLimits = { limitId: "codex", limitName: "Codex", planType: "plus", credits: null,
    primary: null, secondary: { label: "weekly", remainingPercent: remaining, usedPercent: 100 - remaining,
      windowDurationMins: 10080, resetsAt: null } };
  await act(async () => {
    root.render(
      <I18nextProvider i18n={translations}>
        <UsageResetCreditsDialogX open sourceName="Source A" usage={usage}
          summary={{ availableCount: 1, credits: [{ id: "reset-1", resetType: "codexRateLimits",
            status: "available", grantedAt: null, expiresAt: null, title: "Reset A", description: null }] }}
          isRefreshing={false} isConsuming={false} error={error} onClose={vi.fn()}
          onRefresh={vi.fn()} onOpenHelp={onOpenHelp} onConsume={onConsume} />
      </I18nextProvider>
    );
  });
  return { onOpenHelp, onConsume };
}

/** Locates a visible action by its translated label. */
function button(label: string): HTMLButtonElement {
  const match = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
    .find((entry) => entry.textContent === label || entry.getAttribute("aria-label") === label);
  if (match === undefined) {
    throw new Error(`Missing button: ${label}`);
  }
  return match;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("reset eligibility information", () => {
  it("should warn without blocking selection and keep the warning during confirmation", async () => {
    const { onConsume } = await renderDialog();
    expect(document.body.textContent).toContain(frSources.sources.resetCredits.eligibilityWarning);
    expect(button("Appliquer").disabled).toBe(false);
    await act(async () => button("Appliquer").click());
    expect(document.body.textContent).toContain(frSources.sources.resetCredits.confirmTitle);
    expect(document.body.textContent).toContain(frSources.sources.resetCredits.eligibilityWarning);
    expect(onConsume).not.toHaveBeenCalled();
  });

  it("should open dated French guidance from the information button", async () => {
    const { onOpenHelp, onConsume } = await renderDialog();
    await act(async () => button(frSources.sources.resetCredits.eligibilityTitle).click());
    const helpDialog = document.querySelector('[aria-labelledby="reset-eligibility-title"]')!;
    expect(helpDialog.textContent).toContain("moins de 80 % restants");
    expect(helpDialog.textContent).toContain("30 octobre 2026");
    const link = helpDialog.querySelector<HTMLAnchorElement>("a")!;
    expect(link.href).toContain("/fr-fr/articles/20001498-");
    await act(async () => link.click());
    expect(onOpenHelp).toHaveBeenCalledWith(link.href);
    expect(onConsume).not.toHaveBeenCalled();
    vi.useFakeTimers();
    await act(async () => {
      button("Fermer").click();
    });
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(document.querySelector('[aria-labelledby="reset-eligibility-title"]')).toBeNull();
  });

  it("should keep information available without warning when a quota qualifies", async () => {
    await renderDialog("en", 79);
    expect(document.body.textContent).not.toContain(enSources.sources.resetCredits.eligibilityWarning);
    await act(async () => button(enSources.sources.resetCredits.eligibilityTitle).click());
    const helpDialog = document.querySelector('[aria-labelledby="reset-eligibility-title"]')!;
    expect(helpDialog.textContent).toContain("October 30, 2026");
    expect(helpDialog.querySelector<HTMLAnchorElement>("a")!.href).toContain("/en/articles/20001498-");
  });

  it("should explain nothingToReset without claiming that no reset credit exists", async () => {
    await renderDialog("fr", 79, "sources.resetCredits.nothingToReset");
    expect(document.body.textContent).toContain(frSources.sources.resetCredits.nothingToReset);
    expect(document.body.textContent).not.toContain("sources.resetCredits.nothingToReset");
    expect(button("Appliquer").disabled).toBe(false);
  });

  it("should preserve unexpected transport errors", async () => {
    await renderDialog("fr", 90, "Connection interrupted");
    expect(document.body.textContent).toContain("Connection interrupted");
  });
});
