import { applyHighlighting } from "../../features/fileLanguages/applyHighlighting";
import { useEffect, useState } from "react";
import type { FileDocument } from "../../stores/files/FileDocument";
import type { FileLanguagesStore } from "../../stores/files/FileLanguagesStore";
import { canonicalLanguage, detectFileLanguage } from "../../features/fileLanguages/catalogue";
import { fileHighlighting, modelFor, monaco } from "./monacoRuntime";

/** Applies only the current document/preferences after asynchronous grammar loading. */
export function useFileHighlighting(
  document: FileDocument,
  store: FileLanguagesStore
): { error: string | null; language: string } {
  const [error, setError] = useState<string | null>(null);
  const automaticLanguage = document.virtualLanguage === undefined
    ? detectFileLanguage(document.name)
    : canonicalLanguage(document.virtualLanguage) ?? "plaintext";
  const language = document.languageOverride ?? automaticLanguage;
  const enabled = store.isEnabled(language);
  useEffect(() => {
    setError(null);
    const model = modelFor(document);
    return applyHighlighting({
      isDisposed: () => model.isDisposed(),
      setLanguage: id => monaco.editor.setModelLanguage(model, id)
    }, enabled ? language : "plaintext", id => fileHighlighting.ensureLanguage(id), setError);
  }, [document, enabled, language]);
  return { error, language: enabled ? language : "plaintext" };
}
