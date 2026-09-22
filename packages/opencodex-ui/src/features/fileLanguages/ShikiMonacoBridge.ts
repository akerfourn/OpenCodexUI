import { shikiToMonaco } from "@shikijs/monaco";
import type * as Monaco from "monaco-editor/editor/editor.api";
import type { createFileHighlighter } from "./shikiHighlighter";

type Highlighter = Awaited<ReturnType<typeof createFileHighlighter>>;

/** Registers lazy languages without repeatedly patching Monaco's global theme functions. */
export class ShikiMonacoBridge {
  /** Each tokenizer owns the adapter's theme/color-map state. */
  private readonly themeSetters: Array<(theme: string) => void> = [];
  /** Theme selected before or after asynchronous grammar loading. */
  private theme = "light-plus";

  /** The highlighter and Monaco instance belong to the renderer lifetime. */
  constructor(private readonly highlighter: Highlighter, private readonly monaco: typeof Monaco) {}

  /** Installs only the requested grammar, retaining the official Shiki tokenizer. */
  register(id: string): void {
    // Shiki patches create/setTheme. A private facade keeps those patches local,
    // so additional lazy grammars cannot wrap global methods or reset the theme.
    const facade = {
      ...this.monaco,
      editor: { ...this.monaco.editor, setTheme: (_theme: string): void => {} }
    };
    shikiToMonaco({ ...this.highlighter, getLoadedLanguages: () => [id] }, facade, {
      tokenizeMaxLineLength: 20000,
      tokenizeTimeLimit: 50
    });
    facade.editor.setTheme(this.theme);
    this.themeSetters.push(facade.editor.setTheme);
  }

  /** Updates every tokenizer's color map before changing the visible editor theme. */
  setTheme(mode: "light" | "dark"): void {
    this.theme = mode === "dark" ? "dark-plus" : "light-plus";
    for (const setTheme of this.themeSetters) setTheme(this.theme);
    this.monaco.editor.setTheme(this.theme);
  }
}
