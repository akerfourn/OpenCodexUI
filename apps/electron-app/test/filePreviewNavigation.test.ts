import { EventEmitter } from "node:events";
import type { WebContents } from "electron";
import { describe, expect, it, vi } from "vitest";
import { configureFilePreviewNavigation } from "../src/main/filePreviewNavigation.js";

describe("HTML preview navigation boundary", () => {
  it.each(["will-frame-navigate", "will-redirect"])("should block non-preview child navigation during %s", event => {
    const contents = new EventEmitter();
    configureFilePreviewNavigation(contents as unknown as WebContents,
      url => url === "http://127.0.0.1:12345/capability/page.html");
    for (const url of ["https://example.test", "file:///app/index.html", "http://127.0.0.1:12345/other/page.html", "about:blank"]) {
      const preventDefault = vi.fn();
      contents.emit(event, { isMainFrame: false, url, preventDefault });
      expect(preventDefault).toHaveBeenCalledOnce();
    }
  });

  it("should allow live preview documents and preserve main application navigation", () => {
    const contents = new EventEmitter();
    configureFilePreviewNavigation(contents as unknown as WebContents,
      url => url === "http://127.0.0.1:12345/capability/page.html");
    const preventDefault = vi.fn();
    contents.emit("will-frame-navigate", { isMainFrame: false,
      url: "http://127.0.0.1:12345/capability/page.html", preventDefault });
    contents.emit("will-frame-navigate", { isMainFrame: true, url: "file:///app/index.html", preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
