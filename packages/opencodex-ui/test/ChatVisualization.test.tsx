// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatVisualizationContext } from "../src/components/messages/ChatVisualizationContext";
import { MarkdownMessage } from "../src/components/messages/MarkdownMessage";
import { createChatVisualizationLoader } from "../src/stores/files/chatVisualizationLoader";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

const opener = "\uE200visualize\uE202";
const closer = "\uE201";
const workspace = {
  sourceId: "wsl",
  projectId: "project",
  workspaceId: "worktree",
  workspacePath: "/workspaces/demo"
};
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

describe("assistant visualizations", () => {
  it("should display a complete HTML reference between Markdown paragraphs in an opaque frame", async () => {
    const path = "C:\\workspace\\output\\[draft]_chart_.html";
    const reference = `${opener}${JSON.stringify({ path, title: "Weekly quota", mode: "wide" })}${closer}`;
    const read = vi.fn().mockResolvedValue("<strong>Chart</strong>");

    await act(async () => renderMarkdown(`**Before**\n${reference}\n*After*`, read));

    expect(read.mock.calls).toEqual([[path]]);
    expect(container.querySelector("strong")?.textContent).toBe("Before");
    expect(container.querySelector("em")?.textContent).toBe("After");
    const frame = container.querySelector("iframe");
    expect(frame?.title).toBe("Weekly quota");
    expect(frame?.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame?.srcdoc).toContain("default-src 'none'");
    expect(frame?.srcdoc).toContain("<strong>Chart</strong>");
  });

  it("should open a normal titled file link without loading HTML when previews are disabled", async () => {
    const onOpenLink = vi.fn();
    const reference = `${opener}{"path":"output/chart.html","title":"Weekly quota"}${closer}`;
    const untitled = `${opener}{"path":"output/detail.htm"}${closer}`;

    await act(async () => renderMarkdown(`${reference}\n${untitled}`, null, true, false, onOpenLink));

    const links = Array.from(container.querySelectorAll("a"));
    expect(links.map((link) => [link.getAttribute("href"), link.textContent])).toEqual([
      ["output/chart.html", "Weekly quota"],
      ["output/detail.htm", "output/detail.htm"]
    ]);
    expect(container.querySelector("iframe")).toBeNull();
    await act(async () => links[0]?.click());
    expect(onOpenLink).toHaveBeenCalledWith("output/chart.html");
  });

  it("should leave escaped, fenced, invalid and streaming references as text", async () => {
    const reference = `${opener}{"path":"chart.html"}${closer}`;
    const read = vi.fn().mockResolvedValue("<strong>Chart</strong>");
    const quotedExamples = [
      `\\${opener}{"path":"chart.html"}${closer}`,
      `\`\`\`\n${reference}\n\`\`\``,
      `${opener}{"path":}${closer}`,
      `${opener}{"title":"Missing path"}${closer}`,
      `${opener}{"path":"javascript:bad.html"}${closer}`
    ].join("\n\n");

    await act(async () => renderMarkdown(quotedExamples, read));
    expect(container.textContent).toContain(reference);
    expect(container.querySelector("a")).toBeNull();
    await act(async () => renderMarkdown(reference, read, false));
    expect(container.textContent).toContain(reference);
    await act(async () => renderMarkdown(reference, read, true, true));
    expect(container.querySelector("iframe")).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it("should read only HTML paths contained by the explicit source workspace", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, value: { content: "<svg></svg>" } });
    const read = createChatVisualizationLoader({ request }, workspace);

    await expect(read("/workspaces/demo/output/chart.html")).resolves.toBe("<svg></svg>");
    await expect(read("../chart.html")).resolves.toBeNull();
    await expect(read("https://example.test/chart.html")).resolves.toBeNull();
    await expect(read("/workspaces/demo/chart.txt")).resolves.toBeNull();
    expect(request.mock.calls).toEqual([[{
      type: "workspaceFiles.read",
      target: { ...workspace, path: "output/chart.html" }
    }]]);
  });

  it("should resolve an unloaded workspace using the conversation source and path", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce([
        { id: "wrong", path: workspace.workspacePath, sourceId: "local", removedAt: null },
        { id: workspace.workspaceId, path: workspace.workspacePath, sourceId: workspace.sourceId, removedAt: null }
      ])
      .mockResolvedValue({ ok: true, value: { content: "<svg></svg>" } });
    const read = createChatVisualizationLoader({ request }, { ...workspace, workspaceId: null });

    await expect(read("chart.html")).resolves.toBe("<svg></svg>");
    expect(request.mock.calls).toEqual([
      [{ type: "projectWorkspaces.list", projectId: workspace.projectId }],
      [{ type: "workspaceFiles.read", target: { ...workspace, path: "chart.html" } }]
    ]);
  });
});

/** Mounts the production renderer with a deterministic source reader. */
function renderMarkdown(
  markdown: string,
  read: ((path: string) => Promise<string | null>) | null,
  renderVisualizationReferences = true,
  isStreaming = false,
  onOpenLink: (href: string) => void = vi.fn()
): void {
  root.render(
    <ChatVisualizationContext.Provider value={read}>
      <MarkdownMessage
        markdown={markdown}
        onOpenLink={onOpenLink}
        renderVisualizationReferences={renderVisualizationReferences}
        isStreaming={isStreaming}
      />
    </ChatVisualizationContext.Provider>
  );
}
