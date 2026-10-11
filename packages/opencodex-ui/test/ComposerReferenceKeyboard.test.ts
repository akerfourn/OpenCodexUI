// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { $createParagraphNode, $createTextNode, $getRoot, getNearestEditorFromDOMNode, type LexicalEditor } from "lexical";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComposerPlainTextInput } from "../src/components/chat/ComposerPlainTextInput";
import { serializeComposerContent } from "../src/components/chat/composerReferences";
import { fileResult } from "./composerReferenceSuggestions.fixture";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let root: Root;
let container: HTMLDivElement;
let input: HTMLDivElement;
let editor: LexicalEditor;
let onKeyDown: ReturnType<typeof vi.fn>;
let onSearchFiles: ReturnType<typeof vi.fn>;

/** Changes the real editor selection so the production OnChange plugin detects its query. */
function setQuery(text: string): void {
  act(() => {
    editor.update(() => {
      const node = $createTextNode(text);
      $getRoot().clear().append($createParagraphNode().append(node));
      node.selectEnd();
    }, { discrete: true });
  });
}

/** Dispatches a browser event through Lexical's listeners and the React composer handler. */
async function press(key: string): Promise<KeyboardEvent> {
  const event = new KeyboardEvent("keydown", { key, code: key, bubbles: true, cancelable: true });
  await act(async () => { input.dispatchEvent(event); });
  return event;
}

describe("composer reference keyboard integration", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    onKeyDown = vi.fn();
    onSearchFiles = vi.fn().mockResolvedValue([fileResult("file.ts")]);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root.render(createElement(ComposerPlainTextInput, {
        value: "", placeholder: "Message", resizeLabel: "Resize", canOpenFileLinks: true,
        enableEmojiSuggestions: true, onChange: vi.fn(), onSearchFiles,
        onSearchSkills: vi.fn().mockResolvedValue([]), onOpenFileLink: vi.fn(), onKeyDown
      }));
    });
    input = container.querySelector<HTMLDivElement>(".composer-editor")!;
    editor = getNearestEditorFromDOMNode(input)!;
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("should select a file with Enter before Lexical inserts a newline or the parent submits", async () => {
    setQuery("@file");
    await act(async () => { vi.advanceTimersByTime(120); });
    const enter = await press("Enter");

    expect(enter.defaultPrevented).toBe(true);
    expect(onKeyDown).not.toHaveBeenCalled();
    expect(editor.getEditorState().read(serializeComposerContent).markdown).toBe("[file.ts](src/file.ts) ");
    expect(input.querySelector("a")?.textContent).toBe("file.ts");
    expect(input.textContent).toBe("file.ts ");
    expect(input.querySelectorAll("p")).toHaveLength(1);
  });

  it("should let emoji suggestions consume their navigation keys and pass ordinary keys to the parent", async () => {
    setQuery("::thinking");
    const arrow = await press("ArrowDown");
    expect(arrow.defaultPrevented).toBe(true);
    expect(onKeyDown).not.toHaveBeenCalled();
    expect(onSearchFiles).not.toHaveBeenCalled();

    await press("a");
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(input.textContent).toBe("::thinking");
  });
});
