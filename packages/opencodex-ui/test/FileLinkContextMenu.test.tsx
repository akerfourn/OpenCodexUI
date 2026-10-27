// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createPortal } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RootStore } from "../src/stores/RootStore";
import { FileLinkMenuProviderX } from "../src/components/files/FileLinkMenuProvider";
import { FileLinkScope } from "../src/components/files/FileLinkScope";
import { MarkdownLink } from "../src/components/messages/MarkdownLink";
import { fileLinkFolderHref } from "../src/components/files/fileLinkFolderHref";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
let root: Root;
let container: HTMLDivElement;
const request = vi.fn(async () => ({ ok: true }));
const writeText = vi.fn(async () => undefined);
const applyError = vi.fn();
const hasLocalAccess = vi.fn((source: string) => source === "local");
const store = { request, sourcesStore: { hasLocalAccess }, appStore: { applyError } } as unknown as RootStore;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

/** Opens the actual delegated context menu, including its default-prevention behavior. */
async function rightClick(selector: string): Promise<MouseEvent> {
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 24, clientY: 30 });
  await act(async () => document.querySelector(selector)!.dispatchEvent(event));
  return event;
}

/** Finds the translated action independently of presentation and icon markup. */
function menuItem(label: string): HTMLElement {
  return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    .find(item => item.textContent === label)!;
}

describe("file link context menu", () => {
  it("should copy the original link with its navigation suffix without opening it", async () => {
    const onOpenLink = vi.fn();
    await act(async () => root.render(
      <FileLinkMenuProviderX store={store}>
        <FileLinkScope sourceId="local" projectPath="/project">
          <MarkdownLink href="src/app.ts:12:4" onOpenLink={onOpenLink}>file</MarkdownLink>
        </FileLinkScope>
      </FileLinkMenuProviderX>
    ));
    const event = await rightClick("a");
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(menuItem("files.links.openFolder"));
    await act(async () => menuItem("files.links.copyLink").click());
    expect(writeText).toHaveBeenCalledWith("src/app.ts:12:4");
    expect(request).not.toHaveBeenCalled();
    expect(onOpenLink).not.toHaveBeenCalled();
  });

  it("should preserve the clicked workspace if the visible source changes while the menu is open", async () => {
    /** Re-renders source selection without remounting the shared menu. */
    async function renderScope(sourceId: string, projectPath: string): Promise<void> {
      await act(async () => root.render(
        <FileLinkMenuProviderX store={store}>
          <FileLinkScope sourceId={sourceId} projectPath={projectPath}>
            <button data-file-link="src/app.ts#L12C4">file</button>
          </FileLinkScope>
        </FileLinkMenuProviderX>
      ));
    }
    await renderScope("local", "/original");
    await rightClick("button");
    await renderScope("remote", "/unrelated");
    await act(async () => menuItem("files.links.openFolder").click());
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith({ type: "system.openLinkFolder", href: "src/app.ts",
      sourceId: "local", projectPath: "/original" });
  });

  it("should use the nearest explicit context for a link rendered through a portal", async () => {
    await act(async () => root.render(
      <FileLinkMenuProviderX store={store}>
        <FileLinkScope sourceId="remote" projectPath="/outer">
          {createPortal(<FileLinkScope sourceId="local" projectPath="/document" documentPath="docs/readme.md">
            <a href="../assets/folder%20name#heading"><span>folder</span></a>
          </FileLinkScope>, document.body)}
        </FileLinkScope>
      </FileLinkMenuProviderX>
    ));
    await rightClick("a span");
    await act(async () => menuItem("files.links.openFolder").click());
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith({ type: "system.openLinkFolder", href: "docs/../assets/folder name",
      sourceId: "local", projectPath: "/document" });
  });

  it("should keep copy available but disable host folder opening for remote sources", async () => {
    await act(async () => root.render(
      <FileLinkMenuProviderX store={store}>
        <FileLinkScope sourceId="remote" projectPath="/remote">
          <a href="/remote/file.ts">file</a>
        </FileLinkScope>
      </FileLinkMenuProviderX>
    ));
    await rightClick("a");
    expect(menuItem("files.links.openFolder").getAttribute("aria-disabled")).toBe("true");
    await act(async () => menuItem("files.links.copyLink").click());
    expect(writeText).toHaveBeenCalledWith("/remote/file.ts");
    expect(request).not.toHaveBeenCalled();
  });

  it("should leave web links and document anchors to their existing menus", async () => {
    await act(async () => root.render(
      <FileLinkMenuProviderX store={store}>
        <FileLinkScope sourceId="local" projectPath="/project">
          <a id="web" href="https://example.test">web</a><a id="anchor" href="#heading">anchor</a>
        </FileLinkScope>
      </FileLinkMenuProviderX>
    ));
    expect((await rightClick("#web")).defaultPrevented).toBe(false);
    expect((await rightClick("#anchor")).defaultPrevented).toBe(false);
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it("should surface clipboard failures through normal application feedback", async () => {
    writeText.mockRejectedValueOnce(new Error("Clipboard denied"));
    await act(async () => root.render(
      <FileLinkMenuProviderX store={store}>
        <FileLinkScope sourceId="local" projectPath="/project"><a href="file.ts">file</a></FileLinkScope>
      </FileLinkMenuProviderX>
    ));
    await rightClick("a");
    await act(async () => menuItem("files.links.copyLink").click());
    expect(applyError).toHaveBeenCalledWith({ type: "error", message: "Error: Clipboard denied" });
  });
});

describe("source file link folder references", () => {
  it("should preserve Windows and UNC syntax and decode file URLs without using host paths", () => {
    expect(fileLinkFolderHref("C:\\project\\src\\file.ts:4:2")).toBe("C:\\project\\src\\file.ts");
    expect(fileLinkFolderHref("file:///C:/project/folder%20name/file.ts#L12")).toBe("C:/project/folder name/file.ts");
    expect(fileLinkFolderHref("\\\\server\\share\\file.ts#L4")).toBe("\\\\server\\share\\file.ts");
    expect(fileLinkFolderHref("LICENSE", "readme.md")).toBe("LICENSE");
    expect(fileLinkFolderHref("bad%link", "docs/readme.md")).toBeNull();
  });
});
