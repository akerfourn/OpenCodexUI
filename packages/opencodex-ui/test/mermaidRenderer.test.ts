// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn(), bind: vi.fn() }));
vi.mock("mermaid", () => ({ default: {
  initialize: engine.initialize, render: engine.render,
  mermaidAPI: { getConfig: () => ({ securityLevel: "strict", htmlLabels: true, themeCSS: "", maxEdges: 500,
    secure: [], flowchart: {}, dompurifyConfig: {} }) }
} }));
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 100"><text>Diagram</text></svg>';

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  engine.render.mockImplementation(async (_id, _code, host: HTMLElement) => {
    host.innerHTML = svg;
    return { svg, bindFunctions: engine.bind };
  });
});

describe("lazy Mermaid rendering boundary", () => {
  it("should render an inert image with natural dimensions, reuse it and remove measurement nodes", async () => {
    const { renderMermaidImage } = await import("../src/components/messages/mermaidRenderer");
    const signal = new AbortController().signal;
    const image = await renderMermaidImage("flowchart LR\nA-->B", "light", signal);
    expect(decodeURIComponent(image)).toContain('width="240"');
    expect(decodeURIComponent(image)).toContain('height="100"');
    expect(await renderMermaidImage("flowchart LR\nA-->B", "light", signal)).toBe(image);
    expect(engine.render).toHaveBeenCalledTimes(1);
    expect(engine.bind).not.toHaveBeenCalled();
    expect(document.body.children.length).toBe(0);
    expect(engine.initialize).toHaveBeenCalledWith(expect.objectContaining({
      securityLevel: "strict", htmlLabels: false, startOnLoad: false, theme: "default",
      secure: expect.arrayContaining(["securityLevel", "secure", "themeCSS", "maxEdges", "htmlLabels", "dompurifyConfig"])
    }));
  });

  it("should serialize theme changes while another diagram is being laid out", async () => {
    const { renderMermaidImage } = await import("../src/components/messages/mermaidRenderer");
    let release!: (value: { svg: string }) => void;
    let notify!: () => void;
    const started = new Promise<void>(resolve => { notify = resolve; });
    engine.render.mockImplementationOnce(() => new Promise(resolve => { release = resolve; notify(); }));
    const first = renderMermaidImage("graph LR; A-->B", "dark", new AbortController().signal);
    await started;
    const second = renderMermaidImage("graph LR; C-->D", "light", new AbortController().signal);
    expect(engine.initialize).toHaveBeenCalledTimes(1);
    release({ svg });
    await Promise.all([first, second]);
    expect(engine.initialize.mock.calls.map(([config]) => config.theme)).toEqual(["dark", "default"]);
    expect(engine.render.mock.calls[0]?.[0]).not.toBe(engine.render.mock.calls[1]?.[0]);
  });

  it("should clean up failed layouts and allow later diagrams to render", async () => {
    const { renderMermaidImage } = await import("../src/components/messages/mermaidRenderer");
    engine.render.mockRejectedValueOnce(new Error("Invalid graph"));
    await expect(renderMermaidImage("invalid", "light", new AbortController().signal)).rejects.toThrow("Invalid graph");
    expect(document.body.children.length).toBe(0);
    await expect(renderMermaidImage("graph LR; A-->B", "light", new AbortController().signal)).resolves.toContain("data:image/svg+xml");
  });

  it("should skip cancelled or oversized jobs without poisoning the render queue", async () => {
    const { renderMermaidImage, MAX_MERMAID_SOURCE_LENGTH } = await import("../src/components/messages/mermaidRenderer");
    const controller = new AbortController();
    controller.abort();
    await expect(renderMermaidImage("cancelled", "light", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    await expect(renderMermaidImage("x".repeat(MAX_MERMAID_SOURCE_LENGTH + 1), "light", new AbortController().signal))
      .rejects.toThrow("50000");
    expect(engine.render).not.toHaveBeenCalled();
  });
});
