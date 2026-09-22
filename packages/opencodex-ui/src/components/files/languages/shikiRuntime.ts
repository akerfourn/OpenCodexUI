import { configurationLoaders } from "../../../features/fileLanguages/configurationLoaders";
import type * as Monaco from "monaco-editor/editor/editor.api";
import { createFileHighlighter, loadFileGrammar } from "../../../features/fileLanguages/shikiHighlighter";
import { ShikiMonacoBridge } from "../../../features/fileLanguages/ShikiMonacoBridge";

/** One engine per renderer; concurrent documents share grammar loading promises. */
export class FileHighlightingRuntime {
  /** Initialization is deferred until the first recognized file is opened. */
  private initialization: Promise<void> | undefined;
  /** Grammar imports are deduplicated; failures can be retried. */
  private readonly pending = new Map<string, Promise<void>>();
  /** Reusable engine and Monaco adapter, available after initialization. */
  private highlighter: Awaited<ReturnType<typeof createFileHighlighter>> | undefined;
  private bridge: ShikiMonacoBridge | undefined;
  /** Remembers changes made while the engine or grammar is loading. */
  private mode: "light" | "dark" = "light";

  /** Uses only the editor instance belonging to this renderer. */
  constructor(private readonly monaco: typeof Monaco) {}

  /** Loads a grammar without replacing document content or undo state. */
  async ensureLanguage(id: string): Promise<void> {
    let operation = this.pending.get(id);
    if (operation === undefined) {
      operation = this.load(id).catch(error => {
        this.pending.delete(id);
        throw error;
      });
      this.pending.set(id, operation);
    }
    await operation;
  }

  /** Applies app theme changes before and after deferred initialization. */
  setTheme(mode: "light" | "dark"): void {
    this.mode = mode;
    if (this.bridge !== undefined) this.bridge.setTheme(mode);
    else this.monaco.editor.setTheme(mode === "dark" ? "vs-dark" : "vs");
  }

  /** Initializes once, then installs exactly one tokenizer for each requested language. */
  private async load(id: string): Promise<void> {
    this.initialization ??= this.initialize().catch(error => {
      this.initialization = undefined;
      throw error;
    });
    await this.initialization;
    await loadFileGrammar(this.highlighter!, id);
    const loadConfiguration = configurationLoaders[id];
    if (loadConfiguration !== undefined) {
      const { conf } = await loadConfiguration();
      this.monaco.languages.setLanguageConfiguration(id, conf);
    }
    this.bridge!.register(id);
    this.bridge!.setTheme(this.mode);
  }

  /** Loads the bundled engine and themes without networking. */
  private async initialize(): Promise<void> {
    this.highlighter = await createFileHighlighter();
    this.bridge = new ShikiMonacoBridge(this.highlighter, this.monaco);
  }
}
