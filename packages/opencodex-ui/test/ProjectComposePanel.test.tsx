import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { OpenCodexDockerComposeSnapshot } from "@open-codex-ui/opencodex-protocol";

import type { ProjectComposeStore } from "../src/stores/project/ProjectComposeStore";
import type { ProjectStore } from "../src/stores/project/ProjectStore";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

import { ProjectComposePanel } from "../src/components/projects/ProjectComposePanel";
import { readComposeServiceCapabilities } from "../src/components/projects/ProjectComposeServiceDialog";
import { ProjectComposeServiceDetails } from "../src/components/projects/ProjectComposeServiceDetails";

describe("ProjectComposePanel", () => {
  it("should show compact service states that open a detail dialog", () => {
    const snapshot = createSnapshot();
    const unknownService = {
      ...snapshot.services[0],
      name: "api",
      state: "unknown" as const,
      containers: []
    };
    const composeStore = {
      snapshot,
      hasLoaded: true,
      isLoading: false,
      errorMessage: null,
      selectedServiceName: "web",
      selectedService: snapshot.services[0],
      services: [...snapshot.services, unknownService],
      isLogsOpen: false,
      selectedLogs: null,
      isLoadingLogs: false,
      logsErrorMessage: null,
      hasComposeFile: true,
      isAvailable: true,
      invalidateIfUnavailable: vi.fn(),
      isServicePending: vi.fn(() => false),
      load: vi.fn(),
      clearSelection: vi.fn(),
      selectService: vi.fn(),
      up: vi.fn(),
      stop: vi.fn(),
      restart: vi.fn(),
      openLogs: vi.fn(),
      closeLogs: vi.fn()
    } as unknown as ProjectComposeStore;

    const markup = renderToStaticMarkup(
      <ProjectComposePanel
        projectStore={{
          composeStore,
          project: { path: "/workspace/project", sourceId: "source-1" }
        } as unknown as ProjectStore}
      />
    );

    expect(markup).toContain("web");
    expect(markup).toContain("docker.compose.status.running");
    expect(markup).toContain('aria-label="web: docker.compose.status.running"');
    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).toContain("project-compose-status-indicator");
    expect(markup).toContain("is-running");
    expect(markup).toContain('aria-label="api: docker.compose.status.unknown"');
  });

  it("should render structured container details for the modal", () => {
    const snapshot = createSnapshot();

    const markup = renderToStaticMarkup(
      <ProjectComposeServiceDetails
        service={snapshot.services[0]}
      />
    );

    expect(markup).toContain("sample-web-1");
    expect(markup).toContain("docker.compose.containerState.running");
    expect(markup).toContain("docker.compose.healthStatus.healthy");
    expect(markup).toContain("127.0.0.1:3000 → 3000/tcp");
  });

  it("should only expose lifecycle actions safe for the service state", () => {
    const snapshot = createSnapshot();
    const runningService = snapshot.services[0];
    const stoppedService = { ...runningService, state: "stopped" as const };
    const unknownService = { ...runningService, state: "unknown" as const };

    expect(readComposeServiceCapabilities(runningService)).toEqual({
      canStart: false,
      canStop: true,
      hasContainers: true
    });
    expect(readComposeServiceCapabilities(stoppedService)).toMatchObject({
      canStart: true,
      canStop: false
    });
    expect(readComposeServiceCapabilities(unknownService)).toMatchObject({
      canStart: false,
      canStop: false
    });
  });
});

/** Creates a compact Compose snapshot for rendering assertions. */
function createSnapshot(): OpenCodexDockerComposeSnapshot {
  return {
    projectPath: "/workspace/project",
    sourceId: "source-1",
    composeFile: "compose.yaml",
    errorMessage: null,
    services: [{
      name: "web",
      state: "running",
      containers: [{
        name: "sample-web-1",
        state: "running",
        health: "healthy",
        exitCode: 0,
        publishers: [{
          url: "127.0.0.1",
          targetPort: 3000,
          publishedPort: 3000,
          protocol: "tcp"
        }]
      }]
    }]
  };
}
