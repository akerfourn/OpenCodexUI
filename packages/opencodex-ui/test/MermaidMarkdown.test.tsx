// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { render } = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../src/components/messages/mermaidRenderer", () => ({ renderMermaidImage: render, MAX_MERMAID_SOURCE_LENGTH: 50000 }));
import { MarkdownMessage } from "../src/components/messages/MarkdownMessage";
import { FileMarkdownContent } from "../src/components/files/FileMarkdownContent";
import { MermaidDiagram } from "../src/components/messages/MermaidDiagram";

const code = "flowchart LR\nA[Début] --> B[Fin]";
const markdown = `\`\`\`mermaid\n${code}\n\`\`\``;
const image = "data:image/svg+xml,%3Csvg/%3E";
let root: Root;
let container: HTMLDivElement;

/** Locates a visible action without depending on MUI's generated styles. */
function button(label: string): HTMLButtonElement {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find(item => item.textContent === label || item.getAttribute("aria-label") === label)!;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  render.mockReset().mockResolvedValue(image);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("Mermaid fenced Markdown", () => {
  it.each(["chat", "file"])("should render Mermaid in a %s with a literal source view", async location => {
    let content = <MarkdownMessage markdown={markdown} onOpenLink={vi.fn()} />;
    if (location === "file") content = <FileMarkdownContent content={markdown} />;
    await act(async () => root.render(content));
    expect(render).toHaveBeenCalledWith(code, "light", expect.any(AbortSignal));
    expect(container.querySelector("img")?.getAttribute("src")).toBe(image);
    expect(container.querySelector('svg:not([data-testid="ContentCopyOutlinedIcon"])')).toBeNull();
    await act(async () => button("message.mermaid.showSource").click());
    expect(container.querySelector("pre")?.textContent).toBe(code);
    expect(button("chat.copyCodeBlock")).toBeDefined();
  });

  it("should leave streamed fences literal and render only once the response completes", async () => {
    await act(async () => root.render(<MarkdownMessage markdown={markdown} isStreaming onOpenLink={vi.fn()} />));
    expect(render).not.toHaveBeenCalled();
    expect(container.querySelector("pre")?.textContent).toContain("flowchart LR");
    await act(async () => root.render(<MarkdownMessage markdown={markdown} isStreaming={false} onOpenLink={vi.fn()} />));
    expect(render).toHaveBeenCalled();
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("should retain invalid source with readable error details", async () => {
    render.mockRejectedValueOnce(new Error("Parse error near invalid"));
    await act(async () => root.render(<FileMarkdownContent content={markdown} />));
    expect(container.textContent).toContain("message.mermaid.invalid");
    expect(container.querySelector("details")?.textContent).toContain("Parse error");
    expect(container.querySelector("pre")?.textContent).toBe(code);
  });

  it("should rerender for a dark theme and ignore a late result from the earlier source", async () => {
    let finish!: (image: string) => void;
    render.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await act(async () => root.render(<MermaidDiagram code="old" />));
    await act(async () => root.render(<ThemeProvider theme={createTheme({ palette: { mode: "dark" } })}>
      <MermaidDiagram code="new" />
    </ThemeProvider>));
    await act(async () => finish("data:image/svg+xml,old"));
    expect(container.querySelector("img")?.getAttribute("src")).toBe(image);
    expect(render).toHaveBeenLastCalledWith("new", "dark", expect.any(AbortSignal));
  });

  it("should show oversized source without attempting diagram layout", async () => {
    const source = "x".repeat(50001);
    await act(async () => root.render(<MermaidDiagram code={source} />));
    expect(render).not.toHaveBeenCalled();
    expect(container.textContent).toContain("message.mermaid.tooLarge");
    expect(container.querySelector("pre")?.textContent).toBe(source);
  });

  it("should wait for an offscreen block to approach the viewport before rendering", async () => {
    let notify!: IntersectionObserverCallback;
    const disconnect = vi.fn();
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { notify = callback; }
      observe() {}
      disconnect = disconnect;
    });
    await act(async () => root.render(<MermaidDiagram code={code} />));
    expect(render).not.toHaveBeenCalled();
    await act(async () => notify([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(render).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalled();
  });
});
