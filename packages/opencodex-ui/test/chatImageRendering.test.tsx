import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OpenCodexThread, OpenCodexTurn, OpenCodexTurnItem } from "@open-codex-ui/opencodex-protocol";
import { MarkdownMessage } from "../src/components/messages/MarkdownMessage";
import { AssistantTurnBlockX } from "../src/components/messages/AssistantTurnBlock";
import { readMarkdownImagePath, transformMarkdownUrl } from "../src/components/messages/markdownUrls";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";

describe("chat file links and images", () => {
  it("should retain Windows and file URL links while blocking executable schemes", () => {
    for (const path of ["C:/Users/user/.codex/generated_images/image.png", "file:///C:/Users/user/image.png"]) {
      const markup = renderToStaticMarkup(<MarkdownMessage markdown={`[Open image](${path})`} onOpenLink={vi.fn()} />);
      expect(markup).toContain(`href="${path}"`);
      expect(markup).toContain("Open image");
    }
    expect(transformMarkdownUrl("javascript:alert(1)", "href")).toBe("");
    expect(transformMarkdownUrl("vbscript:alert(1)", "src")).toBe("");
    expect(transformMarkdownUrl(dataUrl, "href")).toBe("");
  });

  it("should decode UTF-8 filenames in local Markdown image references", () => {
    const path = "C:/generated/génération #1.png";
    const encoded = "C:/generated/g%C3%A9n%C3%A9ration%20%231.png";

    expect(readMarkdownImagePath(encoded)).toBe(path);
    expect(readMarkdownImagePath(`file:///${encoded}`)).toBe(path);
    const markup = renderToStaticMarkup(<MarkdownMessage
      markdown={`[Génération](${encoded})`} onOpenLink={vi.fn()} />);
    expect(markup).toContain(`href="${encoded}"`);
    expect(markup).toContain("Génération");
  });

  it("should render embedded Markdown images with zoom and keep local references as source links", () => {
    const markup = renderToStaticMarkup(<MarkdownMessage markdown={`![Proposals](${dataUrl})`} onOpenLink={vi.fn()} />);
    expect(markup).toContain(`src="${dataUrl}"`);
    expect(markup).toContain('alt="Proposals"');
    expect(markup).toContain('aria-label="message.openImage"');
    const path = "C:/generated/image.png";
    const local = renderToStaticMarkup(<MarkdownMessage markdown={`![Proposals](${path})`} onOpenLink={vi.fn()} />);
    expect(local).toContain(`href="${path}"`);
    expect(local).not.toContain("src=\"file:");
  });

  it("should show generated images after the completed reasoning history collapses without duplicates", () => {
    const image: OpenCodexTurnItem = { id: "image", role: "activity", kind: "imageGeneration",
      content: "Image generation", status: "completed", createdAt: null,
      attachments: [{ id: "attachment", kind: "image", source: "dataUrl", value: dataUrl, name: "Proposals" }] };
    const turn = { id: "turn", items: [image], status: "completed" } as OpenCodexTurn;
    const markup = renderToStaticMarkup(<AssistantTurnBlockX turn={turn}
      preludeItems={[image, { ...image, id: "raw-image" }]} collaborationEvents={[]}
      currentThread={{ id: "thread" } as OpenCodexThread} isRunning={false}
      lastMessageRef={createRef<HTMLElement>()} isLast={false} onOpenLink={vi.fn()} onNavigateThread={vi.fn()} />);
    expect(markup).toContain('aria-expanded="false"');
    expect(markup.split(`src="${dataUrl}"`)).toHaveLength(2);
  });
});
