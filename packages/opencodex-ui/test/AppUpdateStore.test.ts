import { describe, expect, it, vi } from "vitest";
import type { OpenCodexAppUpdateState } from "@open-codex-ui/opencodex-protocol";
import { AppUpdateStore } from "../src/stores/app/AppUpdateStore";

describe("update installation feedback", () => {
  it("should show progress immediately and prevent duplicate requests while IPC is pending", async () => {
    let resolve!: (state: OpenCodexAppUpdateState) => void;
    const request = vi.fn(() => new Promise<OpenCodexAppUpdateState>((done) => { resolve = done; }));
    const store = new AppUpdateStore({ request: request as never });
    store.handleEvent({ type: "app.update.state", state: { ...store.state, isSupported: true, status: "downloaded" } });
    store.install();
    expect(store.state.status).toBe("installing");
    store.install();
    await store.check();
    await store.download();
    expect(request).toHaveBeenCalledOnce();
    const acknowledgement = { ...store.state };
    store.handleEvent({ type: "app.update.state", state: { ...store.state, status: "error", errorMessage: "authorization cancelled" } });
    resolve(acknowledgement);
    await Promise.resolve();
    expect(store.state.status).toBe("error");
  });

  it("should remove installation progress after an IPC failure", async () => {
    const request = vi.fn().mockRejectedValue(new Error("host unavailable"));
    const store = new AppUpdateStore({ request });
    store.handleEvent({ type: "app.update.state", state: { ...store.state, isSupported: true, status: "downloaded" } });
    store.install();
    await vi.waitFor(() => expect(store.state.status).toBe("error"));
    expect(store.state.errorMessage).toBe("host unavailable");
  });
});
