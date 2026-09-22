import { createHighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import { bundledLanguages } from "shiki/langs";
import type { BundledLanguage } from "shiki/langs";

/** Shares the offline WASM engine and two themes; grammars are imported separately. */
export function createFileHighlighter() {
  return createHighlighterCore({
    themes: [import("shiki/themes/dark-plus.mjs"), import("shiki/themes/light-plus.mjs")],
    langs: [],
    engine: createOnigurumaEngine(import("shiki/wasm"))
  });
}

/** Loads a bundled grammar and its upstream embedded-language dependencies. */
export async function loadFileGrammar(
  highlighter: Awaited<ReturnType<typeof createFileHighlighter>>, id: string
): Promise<void> {
  const loader = bundledLanguages[id as BundledLanguage];
  if (loader === undefined) throw new Error(`Unknown bundled language: ${id}`);
  await highlighter.loadLanguage(await loader());
}
