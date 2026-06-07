/**
 * Holds Codex account usage limit state.
 */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexEvent,
  OpenCodexUsageLimits
} from "@open-codex-ui/opencodex-protocol";

import type { RootChildStore } from "./RootChildStore";
import type { RootStore } from "./RootStore";

/**
 * Stores current Codex usage limits.
 */
export class UsageStore implements RootChildStore {
  usage: OpenCodexUsageLimits | null = null;
  isLoading = false;
  isUnavailable = false;

  constructor(private readonly root: RootStore) {
    makeAutoObservable<UsageStore, "root">(
      this,
      { root: false },
      { autoBind: true }
    );
  }

  handleEvent(event: OpenCodexEvent): void {
    if (event.type !== "usage.updated") {
      return;
    }

    if (event.usage !== null && event.usage.limitId !== "codex") {
      console.warn("[OpenCodexUI] ignored unknown usage limit", {
        limitId: event.usage.limitId,
        limitName: event.usage.limitName
      });
      return;
    }

    this.usage = event.usage;
    this.isUnavailable = event.usage === null;
  }

  async load(): Promise<void> {
    if (this.isLoading) {
      return;
    }

    this.isLoading = true;

    try {
      const usage = await this.root.request<OpenCodexUsageLimits | null>({ type: "usage.read" });
      runInAction(() => {
        this.usage = usage;
        this.isUnavailable = usage === null;
      });
    } catch {
      runInAction(() => {
        this.usage = null;
        this.isUnavailable = true;
      });
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }
}
