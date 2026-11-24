// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UsageWindowProgress } from "../src/components/usage/UsageWindowProgress";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, values: { remainingPercent: number; targetPercent: number }) =>
      `${values.remainingPercent}% remaining, ${values.targetPercent}% expected`
  })
}));

const initialTime = new Date("2026-11-24T12:00:00Z");
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(initialTime);
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("UsageWindowProgress", () => {
  it("should move the target as time passes without changing the remaining quota", async () => {
    await act(async () => renderProgress(300, "2026-11-24T14:30:00Z"));

    const bar = container.querySelector('[role="progressbar"]');
    const marker = container.querySelector<HTMLElement>('[aria-hidden="true"]');
    expect(bar?.getAttribute("aria-valuetext")).toBe("60% remaining, 50% expected");
    expect(marker?.style.insetInlineStart).toContain("50%");

    await act(async () => vi.advanceTimersByTime(30 * 60_000));

    expect(bar?.getAttribute("aria-valuenow")).toBe("60");
    expect(bar?.getAttribute("aria-valuetext")).toBe("60% remaining, 40% expected");
    expect(marker?.style.insetInlineStart).toContain("40%");
  });

  it("should remove the target when the window expires", async () => {
    await act(async () => renderProgress(10_080, "2026-11-24T12:01:00Z"));
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();

    await act(async () => vi.advanceTimersByTime(60_000));

    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("60");
  });

  it("should keep the quota visible when the reset time is missing", async () => {
    await act(async () => renderProgress(300, null));

    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("60");
  });
});

/** Renders a progress bar with a fixed quota and the specified reset window. */
function renderProgress(windowDurationMins: number, resetsAt: string | null): void {
  root.render(
    <UsageWindowProgress
      label="Usage"
      remainingPercent={60}
      windowDurationMins={windowDurationMins}
      resetsAt={resetsAt}
      color="primary"
    />
  );
}
