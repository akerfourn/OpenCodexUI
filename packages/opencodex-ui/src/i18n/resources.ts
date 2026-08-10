import { enTranslation } from "./locales/en/index.js";
import { frTranslation } from "./locales/fr/index.js";

export const defaultNS = "translation";

export const resources = {
  fr: {
    translation: frTranslation
  },
  en: {
    translation: enTranslation
  }
} as const;
