import { bundledLanguagesInfo } from "shiki/langs";
import { describe, expect, it, vi } from "vitest";
import { canonicalLanguage, detectFileLanguage, fileLanguages } from "../src/features/fileLanguages/catalogue";
import { createFileHighlighter, loadFileGrammar } from "../src/features/fileLanguages/shikiHighlighter";
import { ShikiMonacoBridge } from "../src/features/fileLanguages/ShikiMonacoBridge";
import { applyHighlighting } from "../src/features/fileLanguages/applyHighlighting";
import type * as Monaco from "monaco-editor/editor/editor.api";

describe("file language catalogue", () => {
  it("should recognize filenames, aliases and specific extensions", () => {
    for (const name of ["pyproject.toml", "Cargo.toml", "CONFIG.TOML"]) expect(detectFileLanguage(name)).toBe("toml");
    for (const name of ["justfile", "Justfile", ".justfile", "tools.just"]) expect(detectFileLanguage(name)).toBe("just");
    for (const name of ["Dockerfile", "Dockerfile.dev", "app.dockerfile"]) expect(detectFileLanguage(name)).toBe("docker");
    expect(detectFileLanguage("app.tsx")).toBe("tsx");
    expect(detectFileLanguage("app.jsx")).toBe("jsx");
    expect(detectFileLanguage("main.py")).toBe("python");
    expect(detectFileLanguage("App.vue")).toBe("vue");
    expect(detectFileLanguage("main.cpp")).toBe("cpp");
    expect(detectFileLanguage("config.json")).toBe("json");
    expect(detectFileLanguage(".env.local")).toBe("dotenv");
    expect(detectFileLanguage("Makefile")).toBe("make");
    expect(detectFileLanguage("notes.unknown")).toBe("plaintext");
    expect(canonicalLanguage("dockerfile")).toBe("docker");
    expect(new Set(fileLanguages.map(language => language.id)).size).toBe(fileLanguages.length);
  });

  it("should keep generated metadata consistent with the installed catalogue", () => {
    expect(fileLanguages.map(language => language.id)).toEqual(bundledLanguagesInfo.map(language => language.id));
  });

  it("should load real TextMate grammars offline and preserve theme handling across lazy loads", async () => {
    const highlighter = await createFileHighlighter();
    const providers = new Map<string, Monaco.languages.TokensProvider>();
    const defineTheme = vi.fn();
    const setTheme = vi.fn();
    const create = vi.fn();
    const monaco = {
      editor: { defineTheme, setTheme, create },
      languages: {
        getLanguages: () => fileLanguages,
        setTokensProvider: (id: string, provider: Monaco.languages.TokensProvider) => {
          providers.set(id, provider);
          return { dispose() {} };
        }
      }
    } as unknown as typeof Monaco;
    try {
      const bridge = new ShikiMonacoBridge(highlighter, monaco);
      for (const [id, line] of [["toml", "enabled = true"], ["just", 'name := "world"'], ["docker", "FROM node:22"]]) {
        await loadFileGrammar(highlighter, id);
        bridge.register(id);
        const provider = providers.get(id)!;
        const tokens = provider.tokenize(line, provider.getInitialState());
        expect(tokens.tokens.some(token => token.scopes.length > 0)).toBe(true);
      }
      bridge.setTheme("dark");
      bridge.setTheme("light");
      expect(setTheme).toHaveBeenLastCalledWith("light-plus");
      expect(monaco.editor.setTheme).toBe(setTheme);
      expect(monaco.editor.create).toBe(create);
      expect([...providers.keys()]).toEqual(["toml", "just", "docker"]);
      expect(defineTheme).toHaveBeenCalledWith("dark-plus", expect.any(Object));
    } finally { highlighter.dispose(); }
  });
});

describe("asynchronous highlighting", () => {
  it("should ignore an old load after the user disables a language", async () => {
    let complete!: () => void;
    const load = vi.fn(() => new Promise<void>(resolve => { complete = resolve; }));
    const target = { isDisposed: () => false, setLanguage: vi.fn() };
    const error = vi.fn();
    const cancel = applyHighlighting(target, "toml", load, error);
    cancel();
    applyHighlighting(target, "plaintext", load, error);
    complete();
    await Promise.resolve();
    expect(target.setLanguage.mock.calls).toEqual([["plaintext"], ["plaintext"]]);
    expect(error).not.toHaveBeenCalled();
  });

  it("should preserve plain text and report a failed grammar load", async () => {
    const target = { isDisposed: () => false, setLanguage: vi.fn() };
    const error = vi.fn();
    applyHighlighting(target, "toml", async () => { throw new Error("Missing grammar chunk"); }, error);
    await Promise.resolve();
    await Promise.resolve();
    expect(target.setLanguage.mock.calls).toEqual([["plaintext"]]);
    expect(error).toHaveBeenCalledWith("Error: Missing grammar chunk");
  });

  it("should not update a disposed document", async () => {
    const target = { isDisposed: () => true, setLanguage: vi.fn() };
    applyHighlighting(target, "toml", async () => {}, vi.fn());
    await Promise.resolve();
    expect(target.setLanguage.mock.calls).toEqual([["plaintext"]]);
  });
});
