import entries from "./catalogue.json";

/** Lightweight language metadata, generated from installed Shiki and Monaco packages. */
export interface FileLanguage {
  id: string;
  name: string;
  aliases: string[];
  extensions: string[];
  filenames: string[];
}

/** No grammar or tokenizer code is imported by this catalogue. */
export const fileLanguages: readonly FileLanguage[] = entries;

/** Maps aliases (including Monaco's dockerfile identifier) to the canonical grammar. */
export function canonicalLanguage(id: string): string | undefined {
  return fileLanguages.find(language => language.id === id || language.aliases.includes(id))?.id;
}

/** Exact filenames precede suffixes; the most specific extension wins. */
export function detectFileLanguage(name: string): string {
  const filename = name.toLowerCase();
  if (filename.startsWith("dockerfile.")) return "docker";
  if (filename.startsWith(".env.")) return "dotenv";
  const exact = fileLanguages.find(language =>
    language.filenames.some(value => value.toLowerCase() === filename));
  if (exact !== undefined) return exact.id;
  let selected = "plaintext";
  let longest = 0;
  for (const language of fileLanguages) {
    for (const extension of language.extensions) {
      if (extension.length > longest && filename.endsWith(extension.toLowerCase())) {
        selected = language.id;
        longest = extension.length;
      }
    }
  }
  return selected;
}
