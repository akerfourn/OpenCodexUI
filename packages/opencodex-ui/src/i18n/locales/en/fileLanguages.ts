import type { TranslationShape } from "../../translationShape.js";
import type { frFileLanguages } from "../fr/fileLanguages.js";

export const enFileLanguages = {
  fileLanguages: {
    language: "Language",
    automatic: "Automatic",
    plaintext: "Plain text",
    description: "Languages from the Shiki catalogue are bundled with the application and available offline. Highlighting loads when a file is opened. Disabling a language displays its files as plain text without changing their contents.",
    count: "{{enabled}} of {{total}} languages enabled",
    search: "Search for a language, extension or filename",
    enabledOnly: "Show enabled languages only",
    enabled: "Enabled",
    toggle: "Enable {{language}} highlighting",
    showMore: "Show more",
    empty: "No languages match this search.",
    saveError: "Could not save this preference. The previous setting has been kept.",
    loadError: "Syntax highlighting could not be loaded. You can still edit the file as plain text.",
    details: "Details"
  }
} as const satisfies TranslationShape<typeof frFileLanguages>;
