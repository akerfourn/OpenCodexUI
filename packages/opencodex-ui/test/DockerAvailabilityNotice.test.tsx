// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { observer } from "mobx-react-lite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenCodexDockerComposeSnapshot } from "@open-codex-ui/opencodex-protocol";
import { DockerAvailabilityNotice } from "../src/components/docker/DockerAvailabilityNotice";
import { useProjectComposePolling } from "../src/components/projects/useProjectComposePolling";
import { ProjectComposeStore } from "../src/stores/project/ProjectComposeStore";
import type { ProjectStore } from "../src/stores/project/ProjectStore";

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
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Exercises the real polling hook against the observable project state. */
function PollingProbe({ store }: { store: ProjectComposeStore }) {
  useProjectComposePolling(store);
  return null;
}
const PollingProbeX = observer(PollingProbe);

describe("optional Docker capability feedback", () => {
  it("should open an explanation and allow a recheck without an inline technical error", async () => {
    const refresh = vi.fn();
    await act(async () => root.render(<DockerAvailabilityNotice reason="engine-unreachable" scope="source"
      isLoading={false} onRefresh={refresh} />));
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain("docker.availability.engine-unreachable.title");
    await act(async () => container.querySelector<HTMLElement>('[role="button"]')!.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("docker.availability.engine-unreachable.description");
    expect(dialog.textContent).toContain("docker.availability.source");
    expect(dialog.textContent).toContain("docker.availability.pollingPaused");
    const recheck = [...dialog.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent === "docker.availability.recheck")!;
    await act(async () => recheck.click());
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("should stop periodic and visibility refreshes while unavailable and resume after a successful explicit check", async () => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    let snapshot: OpenCodexDockerComposeSnapshot = { projectPath: "/project", sourceId: "source",
      composeFile: "compose.yaml", services: [], errorMessage: null,
      availability: { available: false, reason: "engine-unreachable", message: "Engine unavailable" } };
    const request = vi.fn(async () => snapshot);
    const reportError = vi.fn();
    const store = new ProjectComposeStore({ project: { sourceId: "source" }, projectPath: "/project",
      isCodexSourceReady: true } as unknown as ProjectStore, { request, reportError } as never);
    await store.load();
    await act(async () => root.render(<PollingProbeX store={store} />));
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); document.dispatchEvent(new Event("visibilitychange")); });
    expect(request).toHaveBeenCalledOnce();
    snapshot = { ...snapshot, availability: { available: true, clientVersion: "29", serverVersion: "29", serverApiVersion: "1.52" } };
    await act(async () => store.load());
    expect(request).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(request).toHaveBeenCalledTimes(3);
    expect(reportError).not.toHaveBeenCalled();
  });
});
