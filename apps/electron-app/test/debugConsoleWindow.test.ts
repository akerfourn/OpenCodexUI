import { describe, expect, it, vi } from "vitest";
import type { BrowserWindow, WindowOpenHandlerResponse } from "electron";
import { configureDebugConsoleWindow } from "../src/main/debugConsoleWindow.js";

vi.mock("../src/main/contextMenu.js", () => ({ registerContextMenu: vi.fn() }));

/** Captures native event handlers without opening a GUI or starting Electron. */
function contents() {
  return { setWindowOpenHandler: vi.fn(), on: vi.fn() };
}

describe("debug console native window", () => {
  it("should permit only the dedicated same-origin blank surface", () => {
    const webContents = contents();
    configureDebugConsoleWindow({ webContents } as unknown as BrowserWindow);
    const handle = webContents.setWindowOpenHandler.mock.calls[0][0] as
      (request: { url: string; frameName: string }) => WindowOpenHandlerResponse;
    expect(handle({ url: "about:blank", frameName: "opencodex-debug-console" }))
      .toMatchObject({ action: "allow", outlivesOpener: false, overrideBrowserWindowOptions: { minWidth: 480 } });
    expect(handle({ url: "https://example.com", frameName: "opencodex-debug-console" })).toEqual({ action: "deny" });
    expect(handle({ url: "about:blank", frameName: "arbitrary-popup" })).toEqual({ action: "deny" });
  });

  it("should block navigation and nested windows without coupling closing to debug termination", () => {
    const parent = contents();
    configureDebugConsoleWindow({ webContents: parent } as unknown as BrowserWindow);
    const created = parent.on.mock.calls.find(call => call[0] === "did-create-window")![1];
    const child = contents();
    created({ webContents: child });
    expect(child.setWindowOpenHandler.mock.calls[0][0]()).toEqual({ action: "deny" });
    for (const event of ["will-navigate", "will-redirect"]) {
      const preventDefault = vi.fn();
      child.on.mock.calls.find(call => call[0] === event)![1]({ preventDefault });
      expect(preventDefault).toHaveBeenCalledOnce();
    }
    expect(child.on.mock.calls.some(call => call[0] === "closed")).toBe(false);
  });
});
