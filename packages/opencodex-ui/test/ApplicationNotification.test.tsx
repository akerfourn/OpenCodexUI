// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationNotificationX } from "../src/components/app/ApplicationNotification";
import { RootStore } from "../src/stores/RootStore";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("application error notification", () => {
  it("should expose the journal and dismissal from one snackbar without dumping a stack", async () => {
    const appStore = observable({ errorMessage: "Operation failed\nTechnical stack" as string | null, warningMessage: null,
      clearErrorMessage: vi.fn(() => { appStore.errorMessage = null; }), clearWarningMessage: vi.fn() });
    const store = { appStore, openLogsHome: vi.fn() } as unknown as RootStore;
    await act(async () => root.render(<ApplicationNotificationX store={store} />));

    expect(document.querySelector(".MuiSnackbar-root")?.textContent).toContain("logs.errorOccurred");
    expect(document.body.textContent).not.toContain("Operation failed");
    expect(document.body.textContent).not.toContain("Technical stack");
    const logs = [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "logs.viewLogs")!;
    await act(async () => logs.click());
    expect(store.openLogsHome).toHaveBeenCalledTimes(1);
    expect(appStore.errorMessage).toBeNull();
  });

  it("should notify error journal entries from background operations without clearing chat state", () => {
    const store = new RootStore({ request: vi.fn(), onEvent: vi.fn() });
    const reset = vi.spyOn(store.projectsStore, "resetPendingProjectStates");
    store.handleEvent({ type: "logs.created", log: { id: "failure", createdAt: "2026-11-19T12:00:00Z",
      type: "error", message: "Deferred deletion blocked" } });
    expect(store.appStore.errorMessage).toBe("Deferred deletion blocked");
    expect(reset).not.toHaveBeenCalled();

    for (const requestType of ["projectWorkspaces.remove", "threads.workspace.history", "threadPermissions.read",
      "debug", "workspaceFiles.read", "settings.update"]) {
      store.handleEvent({ type: "error", requestType, message: "Operation refused" });
    }
    expect(store.appStore.errorMessage).toBe("Operation refused");
    expect(reset).not.toHaveBeenCalled();

    store.handleEvent({ type: "error", requestType: "threads.list", message: "Thread list unavailable" });
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("should translate known workspace guards in the notification while retaining their raw journal message", async () => {
    const appStore = observable({ errorMessage: "Finish active conversations and sub-agents on this source before workspace maintenance.",
      warningMessage: null, clearErrorMessage: vi.fn(), clearWarningMessage: vi.fn() });
    const store = { appStore, openLogsHome: vi.fn() } as unknown as RootStore;
    await act(async () => root.render(<ApplicationNotificationX store={store} />));
    expect(document.body.textContent).toContain("workspaces.sourceActive");
    await act(async () => {
      runInAction(() => { appStore.errorMessage = "Workspace contains modified, untracked or ignored files. Save or remove them before deleting it."; });
    });
    expect(document.body.textContent).toContain("workspaces.removeDirty");
  });
});
