import { action, makeObservable, observable, runInAction } from "mobx";

import type {
  OpenCodexAppUpdateState,
  OpenCodexEvent,
  OpenCodexRequest
} from "@open-codex-ui/opencodex-protocol";

/** Backend request capability required by application update actions. */
export type AppUpdateRequestPort = {
  request<TResponse = unknown>(request: OpenCodexRequest): Promise<TResponse>;
};

/**
 * Stores the host updater snapshot and exposes explicit check/download/install actions.
 */
export class AppUpdateStore {
  /** Latest update state received from the Electron host. */
  state: OpenCodexAppUpdateState = createInitialState();

  /** Whether the current error banner was dismissed in this renderer session. */
  isErrorDismissed = false;

  /** Prevents duplicate manual checks while a request is pending. */
  isChecking = false;

  /** Creates an application update store over the generic backend request port. */
  constructor(private readonly root: AppUpdateRequestPort) {
    makeObservable<AppUpdateStore, "root">(this, {
      root: false,
      state: observable,
      isErrorDismissed: observable,
      isChecking: observable,
      dismissError: action,
      handleEvent: action
    });
  }

  /** Loads the current host state after the renderer has bootstrapped. */
  async load(): Promise<void> {
    try {
      const state = await this.root.request<OpenCodexAppUpdateState>({ type: "app.update.state" });
      runInAction(() => {
        this.applyState(state);
      });
    } catch (error) {
      this.applyRequestError(error);
    }
  }

  /** Requests a provider check, bypassing the host cooldown for manual actions. */
  async check(): Promise<void> {
    if (this.isChecking) {
      return;
    }
    runInAction(() => {
      this.isChecking = true;
      this.isErrorDismissed = false;
    });
    try {
      const state = await this.root.request<OpenCodexAppUpdateState>({
        type: "app.update.check",
        force: true
      });
      runInAction(() => {
        this.applyState(state);
      });
    } catch (error) {
      this.applyRequestError(error);
    } finally {
      runInAction(() => { this.isChecking = false; });
    }
  }

  /** Starts an explicit update download. */
  async download(): Promise<void> {
    try {
      const state = await this.root.request<OpenCodexAppUpdateState>({ type: "app.update.download" });
      runInAction(() => {
        this.applyState(state);
      });
    } catch (error) {
      this.applyRequestError(error);
    }
  }

  /** Starts the explicit native install/relaunch sequence. */
  install(): void {
    void this.root.request<OpenCodexAppUpdateState>({ type: "app.update.install" })
      .then((state) => {
        runInAction(() => {
          this.applyState(state);
        });
      })
      .catch((error: unknown) => {
        this.applyRequestError(error);
      });
  }

  /** Applies update events emitted asynchronously by the host process. */
  handleEvent(event: OpenCodexEvent): void {
    if (event.type === "app.update.state") {
      this.applyState(event.state);
    }
  }

  /** Hides the banner without discarding the host error or its diagnostics. */
  dismissError(): void {
    this.isErrorDismissed = true;
  }

  /** Replaces the local state with a detached protocol snapshot. */
  private applyState(state: OpenCodexAppUpdateState): void {
    if (state.status !== this.state.status || state.errorMessage !== this.state.errorMessage
      || state.checkedAt !== this.state.checkedAt) {
      this.isErrorDismissed = false;
    }
    this.state = {
      ...state,
      progress: state.progress === null ? null : { ...state.progress }
    };
  }

  /** Displays a transport failure in the same state channel as updater failures. */
  private applyRequestError(error: unknown): void {
    runInAction(() => {
      this.isErrorDismissed = false;
      this.state = {
        ...this.state,
        status: "error",
        errorMessage: error instanceof Error && error.message.length > 0
          ? error.message
          : String(error),
        progress: null
      };
    });
  }
}

/** Creates the conservative state used before the first host response. */
function createInitialState(): OpenCodexAppUpdateState {
  return {
    currentVersion: "",
    isSupported: false,
    status: "idle",
    availableVersion: null,
    releaseName: null,
    releaseDate: null,
    progress: null,
    errorMessage: null,
    checkedAt: null
  };
}
