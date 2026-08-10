/**
 * Configures translations and runtime language switching for the OpenCodex UI.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import type { OpenCodexLanguage } from "@open-codex-ui/opencodex-protocol";

import { defaultNS, resources } from "./resources.js";

export type OpenCodexResolvedLanguage = Exclude<OpenCodexLanguage, "system">;

export { defaultNS, resources } from "./resources.js";

/**
 * Initializes i18n and applies the requested startup language.
 *
 * @param language Language used for localized labels.
 *
 * @returns Nothing.
 */
export function initializeOpenCodexI18n(language: OpenCodexLanguage = "system"): void {
  void i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: resolveLanguage(language),
      fallbackLng: "fr",
      interpolation: {
        escapeValue: false
      }
    });
}

/**
 * Applies a runtime language change to the shared i18n instance.
 *
 * @param language Language used for localized labels.
 *
 * @returns Nothing.
 */
export function applyOpenCodexLanguage(language: OpenCodexLanguage): void {
  const nextLanguage = resolveLanguage(language);

  if (i18n.isInitialized && i18n.language !== nextLanguage) {
    void i18n.changeLanguage(nextLanguage);
  }
}

/**
 * Resolves the effective UI language from a protocol language setting.
 *
 * @param language Language used for localized labels.
 *
 * @returns Effective UI language.
 */
function resolveLanguage(language: OpenCodexLanguage): OpenCodexResolvedLanguage {
  if (language === "fr" || language === "en") {
    return language;
  }

  if (typeof navigator === "undefined") {
    return "fr";
  }

  const preferredLanguage = navigator.language.toLowerCase();
  return preferredLanguage.startsWith("en") ? "en" : "fr";
}
