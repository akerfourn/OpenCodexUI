import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppUpdateStore } from "../src/stores/app/AppUpdateStore";
import { AppUpdateBannerX } from "../src/components/app/AppUpdateBanner";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

/** Creates a supported updater with a raw provider error. */
function createStore(request = vi.fn().mockRejectedValue(new Error("network unavailable"))) {
  const store = new AppUpdateStore({ request });
  store.handleEvent({ type: "app.update.state", state: {
    ...store.state, isSupported: true, status: "error", errorMessage: "raw provider diagnostics"
  } });
  return store;
}

describe("application update errors", () => {
  it("should show generic text and accessible actions without exposing raw diagnostics", () => {
    const markup = renderToStaticMarkup(<AppUpdateBannerX store={createStore()} />);
    expect(markup).toContain("updates.error");
    expect(markup).toContain("updates.details");
    expect(markup).toContain('aria-label="updates.retry"');
    expect(markup).toContain('aria-label="updates.dismiss"');
    expect(markup).not.toContain("raw provider diagnostics");
  });

  it("should keep a dismissed error hidden across identical snapshots without deleting it", () => {
    const store = createStore();
    store.dismissError();
    store.handleEvent({ type: "app.update.state", state: { ...store.state } });
    expect(renderToStaticMarkup(<AppUpdateBannerX store={store} />)).toBe("");
    expect(store.state.errorMessage).toBe("raw provider diagnostics");
    store.handleEvent({ type: "app.update.state", state: { ...store.state, errorMessage: "new failure" } });
    expect(store.isErrorDismissed).toBe(false);
  });

  it("should show a failed retry again and prevent concurrent checks", async () => {
    const request = vi.fn().mockRejectedValue(new Error("network unavailable"));
    const store = createStore(request);
    store.dismissError();
    const retry = store.check();
    expect(store.isChecking).toBe(true);
    await store.check();
    await retry;
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith({ type: "app.update.check", force: true });
    expect(store.isChecking).toBe(false);
    expect(store.isErrorDismissed).toBe(false);
    expect(store.state.errorMessage).toBe("network unavailable");
  });
});
