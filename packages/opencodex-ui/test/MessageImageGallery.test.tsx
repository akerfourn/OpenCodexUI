// @vitest-environment jsdom
import { act, createRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenCodexAttachment, OpenCodexTurnItem } from "@open-codex-ui/opencodex-protocol";
import { MessageRowX } from "../src/components/messages/MessageRow";
import { ChatImage } from "../src/components/messages/ChatImage";
import { ChatImageContext } from "../src/components/messages/ChatImageContext";
import { ActivityImageResultsX } from "../src/components/messages/ActivityImageResults";
import { ApplicationErrorContext } from "../src/components/app/applicationErrorContext";
import { ImageUnavailableError } from "../src/stores/files/ImageUnavailableError";

const translate = (key: string): string => key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: translate }) }));
const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
let root: Root;
let container: HTMLDivElement;

/** Builds a sent message without involving a transport or application store. */
function message(id: string, content: string, attachments: OpenCodexAttachment[] = []): ReactNode {
  const item: OpenCodexTurnItem = { id, role: "user", kind: "message", status: "completed",
    createdAt: null, content, attachments };
  return <MessageRowX key={id} item={item} isLast={false} lastMessageRef={createRef<HTMLElement>()} onOpenLink={vi.fn()} />;
}

/** Finds modal actions even when MUI renders the dialog through a portal. */
function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")]
    .find(element => element.getAttribute("aria-label") === label || element.textContent === label);
  if (found === undefined) throw new Error(`Missing button: ${label}`);
  return found;
}

/** Returns the currently selected image rather than a background message thumbnail. */
function selectedImage(): HTMLImageElement | null {
  return document.querySelector('[role="dialog"] img');
}

/** Sends keyboard navigation through the dialog's actual event boundary. */
async function key(value: string): Promise<void> {
  await act(async () => document.querySelector('[role="dialog"]')!
    .dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true })));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("message image viewer", () => {
  it("should combine Markdown and attachments while keeping repeated images and other messages isolated", async () => {
    await act(async () => root.render(<>
      {message("first", `![Inline](${dataUrl})`, [
        { id: "one", kind: "image", source: "dataUrl", value: dataUrl, name: "Attachment one" },
        { id: "file", kind: "file", source: "dataUrl", value: "data:text/plain;base64,AA==", name: "notes.txt" },
        { id: "two", kind: "image", source: "dataUrl", value: dataUrl, name: "Attachment two" }
      ])}
      {message("other", `![Other message](${dataUrl})`)}
    </>));
    await act(async () => container.querySelectorAll<HTMLButtonElement>('button[aria-label="message.openImage"]')[1].click());
    expect(selectedImage()?.alt).toBe("Attachment one");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("2 / 3");
    await key("ArrowLeft");
    expect(selectedImage()?.alt).toBe("Inline");
    expect(button("message.imageViewer.previous").disabled).toBe(true);
    await key("ArrowLeft");
    expect(selectedImage()?.alt).toBe("Inline");
    await key("ArrowRight");
    await act(async () => button("message.imageViewer.next").click());
    expect(selectedImage()?.alt).toBe("Attachment two");
    expect(button("message.imageViewer.next").disabled).toBe(true);
    await key("ArrowRight");
    expect(selectedImage()?.alt).toBe("Attachment two");
    await key("Escape");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => container.querySelectorAll<HTMLButtonElement>('button[aria-label="message.openImage"]')[3].click());
    expect(selectedImage()?.alt).toBe("Other message");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("1 / 1");
    expect(document.querySelector('button[aria-label="message.imageViewer.next"]')).toBeNull();
  });

  it("should preserve rendered order for pending source reads and ignore a late result after navigation", async () => {
    let finish!: (url: string) => void;
    const pending = new Promise<string>(resolve => { finish = resolve; });
    const loadImage = vi.fn().mockReturnValue(pending);
    await act(async () => root.render(<ChatImageContext.Provider value={{ loadImage, onOpenLink: vi.fn() }}>
      {message("async", `![First](${dataUrl})\n\n![Pending](/source/image.png)\n\n![Last](${dataUrl})`)}
    </ChatImageContext.Provider>));
    await act(async () => button("message.openImage").click());
    await key("ArrowRight");
    expect(selectedImage()).toBeNull();
    expect(loadImage).toHaveBeenCalledWith("/source/image.png");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("2 / 3");
    await key("ArrowRight");
    expect(selectedImage()?.alt).toBe("Last");
    await act(async () => finish(dataUrl));
    expect(selectedImage()?.alt).toBe("Last");
    await key("ArrowLeft");
    expect(selectedImage()?.alt).toBe("Pending");
  });

  it("should keep tool outputs inside their originating message and preserve notification deduplication", async () => {
    const item: OpenCodexTurnItem = { id: "tool", role: "activity", status: "completed", createdAt: null, content: "",
      attachments: [
        { id: "a", kind: "image", source: "dataUrl", value: dataUrl, name: "Tool first" },
        { id: "b", kind: "image", source: "dataUrl", value: "https://example.test/b.png", name: "Tool second" }
      ] };
    await act(async () => root.render(<ActivityImageResultsX items={[item, { ...item, id: "duplicate" },
      { ...item, id: "other", attachments: [{ id: "c", kind: "image", source: "dataUrl",
        value: "https://example.test/c.png", name: "Other tool" }] }]} />));
    expect(container.querySelectorAll("img")).toHaveLength(3);
    await act(async () => button("message.openImage").click());
    await key("ArrowRight");
    expect(selectedImage()?.alt).toBe("Tool second");
    expect(button("message.imageViewer.next").disabled).toBe(true);
  });

  it("should zoom a decoded image and reset to fit after selecting another image", async () => {
    await act(async () => root.render(message("zoom", `![First](${dataUrl})\n\n![Second](${dataUrl})`)));
    await act(async () => button("message.openImage").click());
    Object.defineProperties(selectedImage()!, { naturalWidth: { value: 1600 }, naturalHeight: { value: 1200 } });
    await act(async () => selectedImage()!.dispatchEvent(new Event("load")));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("50%");
    await act(async () => button("files.imageZoomIn").click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("63%");
    await act(async () => button("files.imageActualSize").click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("100%");
    await act(async () => button("files.imageFit").click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("50%");
    const wheel = new WheelEvent("wheel", { deltaY: -100, clientX: 400, clientY: 300, cancelable: true });
    await act(async () => document.querySelector("[data-image-viewport]")!.dispatchEvent(wheel));
    expect(wheel.defaultPrevented).toBe(true);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("136%");
    await key("ArrowRight");
    expect(button("files.imageZoomIn").disabled).toBe(true);
    Object.defineProperties(selectedImage()!, { naturalWidth: { value: 1600 }, naturalHeight: { value: 1200 } });
    await act(async () => selectedImage()!.dispatchEvent(new Event("load")));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("50%");
  });

  it("should show unavailable browser images locally and leave navigation and retry available", async () => {
    const reportError = vi.fn();
    await act(async () => root.render(<ApplicationErrorContext.Provider value={reportError}>
      {message("error", `![First](${dataUrl})\n\n![Second](${dataUrl})`)}
    </ApplicationErrorContext.Provider>));
    await act(async () => button("message.openImage").click());
    await act(async () => selectedImage()!.dispatchEvent(new Event("error")));
    expect(reportError).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"] [data-image-unavailable]')?.textContent).toBe("First");
    await act(async () => button("files.retry").click());
    expect(selectedImage()?.alt).toBe("First");
    await key("ArrowRight");
    expect(selectedImage()?.alt).toBe("Second");
  });

  it("should forward the original source error and recover on retry without exposing filesystem URLs", async () => {
    const failure = new Error("Source connection unavailable");
    const reportError = vi.fn();
    const loadImage = vi.fn().mockRejectedValue(failure);
    await act(async () => root.render(<ApplicationErrorContext.Provider value={reportError}>
      <ChatImageContext.Provider value={{ loadImage, onOpenLink: vi.fn() }}>
        {message("source-error", `![Ready](${dataUrl})\n\n![Unavailable](/source/image.png)`)}
      </ChatImageContext.Provider>
    </ApplicationErrorContext.Provider>));
    await act(async () => button("message.openImage").click());
    await key("ArrowRight");
    expect(reportError).toHaveBeenCalledWith(failure, "message.imageViewer.title");
    expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain(failure.message);
    expect(selectedImage()).toBeNull();
    loadImage.mockResolvedValue(dataUrl);
    await act(async () => button("files.retry").click());
    expect(selectedImage()?.alt).toBe("Unavailable");
    expect(selectedImage()?.getAttribute("src")).toBe(dataUrl);
  });

  it("should navigate through missing images without reporting them and recover on explicit retry", async () => {
    const reportError = vi.fn();
    const loadImage = vi.fn().mockRejectedValue(new ImageUnavailableError("Temporary file deleted"));
    await act(async () => root.render(<ApplicationErrorContext.Provider value={reportError}>
      <ChatImageContext.Provider value={{ loadImage, onOpenLink: vi.fn() }}>
        {message("missing", `![Ready](${dataUrl})\n\n![Missing](/tmp/image.png)\n\n![Next](${dataUrl})`)}
      </ChatImageContext.Provider>
    </ApplicationErrorContext.Provider>));
    await act(async () => button("message.openImage").click());
    await key("ArrowRight");
    expect(document.querySelector('[role="dialog"] [data-image-unavailable]')?.textContent).toBe("Missing");
    expect(reportError).not.toHaveBeenCalled();
    await key("ArrowRight");
    expect(selectedImage()?.alt).toBe("Next");
    await key("ArrowLeft");
    loadImage.mockResolvedValue(dataUrl);
    await act(async () => button("files.retry").click());
    expect(selectedImage()?.alt).toBe("Missing");
    expect(reportError).not.toHaveBeenCalled();
  });

  it("should reuse already resolved source bytes when opening a thumbnail", async () => {
    const loadImage = vi.fn().mockResolvedValue(dataUrl);
    await act(async () => root.render(<ChatImageContext.Provider value={{ loadImage, onOpenLink: vi.fn() }}>
      {message("resolved", "![Resolved](/source/image.png)")}
    </ChatImageContext.Provider>));
    expect(loadImage).toHaveBeenCalledTimes(1);
    await act(async () => button("message.openImage").click());
    expect(selectedImage()?.alt).toBe("Resolved");
    expect(loadImage).toHaveBeenCalledTimes(1);
  });

  it("should offer the same zoom controls when an image is displayed outside a message gallery", async () => {
    await act(async () => root.render(<ChatImage src={dataUrl} alt="Standalone" />));
    await act(async () => button("message.openImage").click());
    expect(selectedImage()?.alt).toBe("Standalone");
    expect(button("files.imageZoomIn")).toBeDefined();
    expect(document.querySelector('button[aria-label="message.imageViewer.next"]')).toBeNull();
    await act(async () => button("message.imageViewer.close").click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
