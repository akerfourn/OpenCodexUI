import type { languages } from "monaco-editor/editor/editor.api";
import { fileLanguages } from "../../../features/fileLanguages/catalogue";

/** Registers metadata only; Shiki loads tokenizers when a document needs one. */
export function registerFileLanguages(api: Pick<typeof languages,
  "register" | "getLanguages" | "setLanguageConfiguration">): void {
  const registered = new Set(api.getLanguages().map(language => language.id));
  for (const language of fileLanguages) {
    if (!registered.has(language.id)) {
      api.register({ id: language.id, aliases: [language.name, ...language.aliases],
        extensions: language.extensions, filenames: language.filenames });
    }
  }
  for (const id of ["toml", "just"]) {
    api.setLanguageConfiguration(id, {
      comments: { lineComment: "#" },
      brackets: [["{", "}"], ["[", "]"], ["(", ")"]],
      autoClosingPairs: [
        { open: "{", close: "}" }, { open: "[", close: "]" }, { open: "(", close: ")" },
        { open: '"', close: '"', notIn: ["string", "comment"] },
        { open: "'", close: "'", notIn: ["string", "comment"] }
      ]
    });
  }
}
