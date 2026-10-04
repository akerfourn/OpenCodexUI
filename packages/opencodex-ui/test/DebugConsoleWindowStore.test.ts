import { describe, expect, it, vi } from "vitest";
import { DebugConsoleWindowStore } from "../src/stores/debug/DebugConsoleWindowStore";

/** Replaces only native window/DOM boundaries while exercising the real lifecycle store. */
function fixture() {
  const listeners = new Map<string, () => void>();
  const container = {};
  const child = {
    closed: false, focus: vi.fn(), close: vi.fn(),
    document: { title: "", body: { style: {}, append: vi.fn() }, createElement: vi.fn(() => container) },
    addEventListener: vi.fn((name: string, listener: () => void) => listeners.set(name, listener)),
    removeEventListener: vi.fn((name: string) => listeners.delete(name))
  };
  const open = vi.fn(() => child as unknown as Window);
  return { store: new DebugConsoleWindowStore(open), open, child, listeners, container };
}

describe("detached debug console", () => {
  it("should reuse one window without wrapping native resources in observable proxies", () => {
    const { store, open, child, container } = fixture();
    expect(store.open("Console")).toBe(true);
    expect(store.host?.window).toBe(child);
    expect(store.host?.container).toBe(container);
    expect(child.document.title).toBe("Console");
    expect(store.open("Console")).toBe(true);
    expect(open).toHaveBeenCalledOnce();
    expect(child.focus).toHaveBeenCalledTimes(2);
  });

  it("should release closed windows and allow reopening while retaining debugger ownership elsewhere", () => {
    const { store, open, child, listeners } = fixture();
    store.open("Console");
    listeners.get("pagehide")?.();
    expect(store.host).toBeNull();
    expect(child.close).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
    store.open("Console");
    expect(open).toHaveBeenCalledTimes(2);
    store.close();
    expect(store.host).toBeNull();
    expect(child.close).toHaveBeenCalledOnce();
    expect(listeners.size).toBe(0);
  });

  it("should retain the inline console if the host blocks popups", () => {
    const store = new DebugConsoleWindowStore(() => null);
    expect(store.open("Console")).toBe(false);
    expect(store.host).toBeNull();
  });
});
