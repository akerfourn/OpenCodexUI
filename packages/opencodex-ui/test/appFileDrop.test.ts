import { getDropTarget } from "../src/components/app/AppFileDropOverlay";
import type { RootStore } from "../src/stores/RootStore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerAppFileDrop, type FileDropTarget } from "../src/components/app/appFileDrop";

/** Browser I/O double that preserves asynchronous file reads. */
class TestFileReader extends EventTarget {
  result: string | null = null;
  error = null;
  /** Converts fixture bytes into the browser's data URL response. */
  readAsDataURL(file: File): void {
    void file.arrayBuffer().then((bytes) => {
      this.result = `data:application/octet-stream;base64,${Buffer.from(bytes).toString("base64")}`;
      this.dispatchEvent(new Event("load"));
    });
  }
}

let surface: EventTarget;
let target: FileDropTarget | null;
let cleanup: () => void;
const hover = vi.fn();
const error = vi.fn();
const add = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("FileReader", TestFileReader);
  surface = new EventTarget();
  target = { addAttachments: add };
  cleanup = registerAppFileDrop(surface as unknown as Window, {
    getTarget: () => target, onHover: hover, onError: error, directoryError: "Folders are unsupported"
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** Dispatches real cancelable events with fixture drag data. */
function drag(type: string, files: File[] = [], types = ["Files"], items: unknown[] = []): DragEvent {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { files, types, items, dropEffect: "move" } });
  surface.dispatchEvent(event);
  return event as DragEvent;
}

describe("application file drop", () => {
  it("should attach files to the chat selected at drop time without navigating", async () => {
    const event = drag("drop", [new File(["hello"], "notes.txt")]);
    const otherChat = vi.fn();
    target = { addAttachments: otherChat };
    await vi.waitFor(() => expect(add).toHaveBeenCalledOnce());
    expect(event.defaultPrevented).toBe(true);
    expect(add).toHaveBeenCalledWith([expect.objectContaining({ kind: "file", name: "notes.txt" })]);
    expect(otherChat).not.toHaveBeenCalled();
    expect(hover).toHaveBeenLastCalledWith(false);
  });

  it("should prevent file navigation without attaching anything when no chat accepts files", () => {
    target = null;
    expect(drag("dragover").dataTransfer?.dropEffect).toBe("none");
    expect(drag("drop", [new File(["hello"], "notes.txt")]).defaultPrevented).toBe(true);
    expect(add).not.toHaveBeenCalled();
  });

  it("should preserve text and link drag behavior", () => {
    expect(drag("dragover", [], ["text/plain"]).defaultPrevented).toBe(false);
    expect(drag("drop", [], ["text/uri-list"]).defaultPrevented).toBe(false);
    expect(add).not.toHaveBeenCalled();
  });

  it("should keep the overlay visible across nested elements and hide it on leaving", () => {
    drag("dragenter");
    drag("dragenter");
    drag("dragleave");
    expect(hover).toHaveBeenLastCalledWith(true);
    drag("dragleave");
    expect(hover).toHaveBeenLastCalledWith(false);
  });

  it("should reject folders without attempting to traverse or attach their contents", () => {
    drag("drop", [], ["Files"], [{ webkitGetAsEntry: () => ({ isDirectory: true }) }]);
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: "Folders are unsupported" }));
    expect(add).not.toHaveBeenCalled();
  });

  it("should report size errors without modifying the existing attachment list", async () => {
    drag("drop", [{ size: 21 * 1024 * 1024 } as File]);
    await vi.waitFor(() => expect(error).toHaveBeenCalledOnce());
    expect(add).not.toHaveBeenCalled();
  });
});


describe("file drop destination", () => {
  it("should accept the visible editable chat and reject read-only or busy destinations", () => {
    const composer = { addAttachments: vi.fn() };
    const store = {
      activeProjectStore: { isReadOnlyFromCache: false, threadListStore: { loadingThreadId: null } },
      activeChatStore: { composer, runtime: { isWorking: false, isStartingTurn: false, isRecovering: false },
        actions: { canSteerActiveTurn: false } },
      appStore: { isShuttingDown: false, shouldShowOnboarding: false }
    };
    const root = store as unknown as RootStore;
    expect(getDropTarget(root)).toBe(composer);
    store.activeChatStore.runtime.isWorking = true;
    expect(getDropTarget(root)).toBeNull();
    store.activeChatStore.actions.canSteerActiveTurn = true;
    expect(getDropTarget(root)).toBe(composer);
    store.activeProjectStore.isReadOnlyFromCache = true;
    expect(getDropTarget(root)).toBeNull();
    expect(getDropTarget({ ...store, activeChatStore: null } as unknown as RootStore)).toBeNull();
  });
});
