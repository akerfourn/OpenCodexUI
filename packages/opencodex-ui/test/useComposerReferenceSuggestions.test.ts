// @vitest-environment jsdom
/** jsdom supplies a DOM for real React effects and headless Lexical insertion tests in Node. */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenCodexFileSearchResult } from "@open-codex-ui/opencodex-protocol";
import { createSuggestionsFixture, fileResult, skillResult } from "./composerReferenceSuggestions.fixture";

let fixture: ReturnType<typeof createSuggestionsFixture>;

/** Advances only the controlled debounce clock and flushes React's asynchronous updates. */
async function advance(milliseconds = 120): Promise<void> {
  await act(async () => { vi.advanceTimersByTime(milliseconds); });
}

/** Controls external source completion order without substituting hook or editor logic. */
function deferredFiles() {
  let resolve!: (results: OpenCodexFileSearchResult[]) => void;
  const promise = new Promise<OpenCodexFileSearchResult[]>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("composer reference suggestions", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    fixture = createSuggestionsFixture();
  });

  afterEach(() => {
    fixture.unmount();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("should debounce the latest file query and preserve its explicit search mode", async () => {
    fixture.onSearchFiles.mockResolvedValue([fileResult("logo.png")]);
    fixture.setQuery("@old");
    await advance(119);
    expect(fixture.onSearchFiles).not.toHaveBeenCalled();

    fixture.setQuery("@! assets");
    await advance(119);
    expect(fixture.onSearchFiles).not.toHaveBeenCalled();
    await advance(1);

    expect(fixture.onSearchFiles).toHaveBeenCalledTimes(1);
    expect(fixture.onSearchFiles).toHaveBeenCalledWith("assets", "filesystem");
    expect(fixture.onSearchSkills).not.toHaveBeenCalled();
    expect(fixture.state.suggestions).toEqual([{ type: "file", result: fileResult("logo.png") }]);
  });

  it("should ignore an older response after a newer query has completed", async () => {
    const old = deferredFiles();
    const latest = deferredFiles();
    fixture.onSearchFiles.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    fixture.setQuery("@old");
    await advance();
    fixture.setQuery("@latest");
    await advance();

    await act(async () => { latest.resolve([fileResult("latest.ts")]); });
    await act(async () => { old.resolve([fileResult("old.ts")]); });

    expect(fixture.state.suggestions).toEqual([{ type: "file", result: fileResult("latest.ts") }]);
    expect(fixture.state.highlightedIndex).toBe(0);
  });

  it("should keep an escaped query dismissed when its request completes or selection is rechecked", async () => {
    const pending = deferredFiles();
    fixture.onSearchFiles.mockReturnValueOnce(pending.promise);
    fixture.setQuery("@file");
    await advance();
    const escape = fixture.press("Escape");
    await act(async () => { pending.resolve([fileResult("file.ts")]); });
    fixture.refresh();
    await advance();

    expect(escape.handled).toBe(true);
    expect(escape.event.defaultPrevented).toBe(true);
    expect(fixture.state.activeTrigger).toBeNull();
    expect(fixture.state.suggestions).toEqual([]);
    expect(fixture.onSearchFiles).toHaveBeenCalledTimes(1);

    fixture.setQuery("@changed");
    await advance();
    expect(fixture.onSearchFiles).toHaveBeenLastCalledWith("changed", "indexed");
  });

  it("should cancel a pending debounce when the hook unmounts", async () => {
    fixture.setQuery("@file");
    fixture.unmount();
    await advance();
    expect(fixture.onSearchFiles).not.toHaveBeenCalled();
  });

  it("should leave Enter available when the current source search fails", async () => {
    fixture.onSearchFiles.mockRejectedValueOnce(new Error("Source disconnected"));
    fixture.setQuery("@file");
    await advance();
    const enter = fixture.press("Enter");

    expect(fixture.state.suggestions).toEqual([]);
    expect(enter.handled).toBe(false);
    expect(enter.event.defaultPrevented).toBe(false);
  });

  it("should bound keyboard selection and insert the chosen file without replacing adjacent text", async () => {
    fixture.onSearchFiles.mockResolvedValue([fileResult("first.ts"), fileResult("second.ts")]);
    fixture.setQuery("Before @file after", "Before @file".length);
    await advance();
    fixture.press("ArrowDown");
    fixture.press("ArrowDown");
    expect(fixture.state.highlightedIndex).toBe(1);
    fixture.press("ArrowUp");
    fixture.press("ArrowUp");
    expect(fixture.state.highlightedIndex).toBe(0);
    fixture.press("ArrowDown");
    const enter = fixture.press("Enter");
    await act(async () => {});

    expect(enter.handled).toBe(true);
    expect(enter.event.defaultPrevented).toBe(true);
    expect(fixture.serialize()).toEqual({ markdown: "Before [second.ts](src/second.ts) after", references: [] });
    expect(fixture.readCaret()).toEqual({ text: " after", offset: 1 });
    expect(fixture.state.activeTrigger).toBeNull();
    expect(fixture.state.suggestions).toEqual([]);
  });

  it("should route skill searches and insert a structured skill reference with Tab", async () => {
    const skill = skillResult();
    fixture.onSearchSkills.mockResolvedValue([skill]);
    fixture.setQuery("$rev");
    await advance();
    expect(fixture.onSearchSkills).toHaveBeenCalledTimes(1);
    expect(fixture.onSearchSkills).toHaveBeenCalledWith("rev");
    expect(fixture.onSearchFiles).not.toHaveBeenCalled();

    const tab = fixture.press("Tab");
    await act(async () => {});

    expect(tab.handled).toBe(true);
    expect(fixture.serialize().references).toEqual([{ type: "skill", name: skill.name, path: skill.path }]);
    expect(fixture.serialize().markdown).toBe("$review ");
    expect(fixture.readCaret()).toEqual({ text: " ", offset: 1 });
  });

  it("should leave the editor unchanged when selection is attempted while disabled", async () => {
    fixture.onSearchFiles.mockResolvedValue([fileResult("file.ts")]);
    fixture.setQuery("@file");
    await advance();
    fixture.setDisabled(true);

    const enter = fixture.press("Enter");
    act(() => { fixture.state.insertReference(fixture.state.suggestions[0]); });

    expect(enter.handled).toBe(false);
    expect(enter.event.defaultPrevented).toBe(false);
    expect(fixture.serialize()).toEqual({ markdown: "@file", references: [] });
  });
});
