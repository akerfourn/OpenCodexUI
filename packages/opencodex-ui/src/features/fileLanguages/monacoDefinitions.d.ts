/** Monaco ships these editing configurations as JavaScript without declarations. */
declare module "monaco-editor/languages/definitions/*" {
  import type { languages } from "monaco-editor/editor/editor.api";
  export const conf: languages.LanguageConfiguration;
}
