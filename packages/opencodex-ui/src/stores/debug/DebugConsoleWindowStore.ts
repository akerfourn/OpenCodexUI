import { makeAutoObservable, observable, runInAction } from "mobx";

/** Native view resources stay inside UI state and never cross the backend transport. */
export interface DebugConsoleWindowHost { window: Window; container: HTMLElement }

/** Owns one detached view of the existing console, independently of project/tool panels. */
export class DebugConsoleWindowStore {
  /** A ref prevents MobX from traversing native DOM/window objects. */
  host: DebugConsoleWindowHost | null = null;
  /** Cleans up native close notifications before an intentional close. */
  private unsubscribe: (() => void) | null = null;

  /** Keeps the native window opener injectable for deterministic lifecycle tests. */
  constructor(private readonly openWindow: () => Window | null = () =>
    window.open("about:blank", "opencodex-debug-console", "width=1040,height=720")) {
    makeAutoObservable<this, "openWindow" | "unsubscribe">(this,
      { host: observable.ref, openWindow: false, unsubscribe: false }, { autoBind: true });
  }

  /** Reuses an existing window; a blocked popup leaves the panel console untouched. */
  open(title: string): boolean {
    if (this.host !== null && !this.host.window.closed) {
      this.host.window.focus();
      return true;
    }
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.host = null;
    const child = this.openWindow();
    if (child === null) return false;
    child.document.title = title;
    child.document.body.style.margin = "0";
    const container = child.document.createElement("div");
    child.document.body.append(container);
    this.host = { window: child, container };
    const closed = (): void => {
      if (this.host?.window !== child) return;
      this.unsubscribe?.();
      runInAction(() => { this.host = null; this.unsubscribe = null; });
    };
    child.addEventListener("pagehide", closed);
    this.unsubscribe = () => child.removeEventListener("pagehide", closed);
    child.focus();
    return true;
  }

  /** Closing this view never sends a stop/disconnect command to the debugger. */
  close(): void {
    const child = this.host?.window;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.host = null;
    child?.close();
  }
}
