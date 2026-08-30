import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number; version?: string }) => (
      values === undefined ? key : `${key}:${values.count ?? values.version ?? ""}`
    )
  })
}));

import { HomeDockerView } from "../src/components/home/HomeDockerView";
import type { RootStore } from "../src/stores/RootStore";

describe("HomeDockerView", () => {
  it("should render existing containers and their safe actions", () => {
    const markup = renderToStaticMarkup(<HomeDockerView store={createRootStore()} />);

    expect(markup).toContain("docker.title");
    expect(markup).toContain("web");
    expect(markup).toContain("nginx:latest");
    expect(markup).toContain("127.0.0.1:8080-&gt;80/tcp");
    expect(markup).toContain("docker.actions.stop");
    expect(markup).toContain("docker.actions.restart");
    expect(markup).toContain("docker.actions.logs");
    expect(markup).not.toContain("docker.actions.delete");
  });
});

/** Creates the observable-shaped Docker store surface consumed by the view. */
function createRootStore(): RootStore {
  return {
    dockerHostStore: {
      snapshot: {
        availability: {
          available: true,
          clientVersion: "29.0.0",
          serverVersion: "29.0.0",
          serverApiVersion: "1.52"
        },
        containers: [{
          id: "container-1",
          name: "web",
          image: "nginx:latest",
          state: "running",
          status: "Up 1 minute",
          ports: "127.0.0.1:8080->80/tcp"
        }]
      },
      selectedContainerId: null,
      selectedLogs: null,
      errorMessage: null,
      logsErrorMessage: null,
      hasLoaded: true,
      isLoading: false,
      isLoadingLogs: false,
      isContainerPending: vi.fn(() => false),
      load: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      restart: vi.fn(),
      openLogs: vi.fn(),
      closeLogs: vi.fn()
    }
  } as unknown as RootStore;
}
