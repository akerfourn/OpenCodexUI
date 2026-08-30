import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { OpenCodexDockerComposeSnapshot } from "@open-codex-ui/opencodex-protocol";

import type { ProjectComposeStore } from "../src/stores/project/ProjectComposeStore";
import type { ProjectStore } from "../src/stores/project/ProjectStore";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

import { ProjectComposePanel } from "../src/components/projects/ProjectComposePanel";
import { ProjectComposeServiceDetails } from "../src/components/projects/ProjectComposeServiceDetails";

describe("ProjectComposePanel", () => {
  it("should show service state text and expanded runtime details", () => {
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
    expect(markup).toContain('aria-controls="project-compose-details-web-0"');
    expect(markup).toContain('role="region"');
    expect(markup).toContain('id="project-compose-details-web-0-heading"');
    expect(markup).toContain("project-compose-status-indicator");
    expect(markup).toContain("sample-web-1");
    expect(markup).toContain("docker.compose.actions.restart");
    expect(markup).toContain('aria-label="api: docker.compose.status.unknown"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain('aria-controls="project-compose-details-api');
  });

  it("should only offer lifecycle actions for safe service states", () => {
    const snapshot = createSnapshot();
    const unknownService = {
      ...snapshot.services[0],
      name: "api",
      state: "unknown" as const,
      containers: []
    };

    const markup = renderToStaticMarkup(
      <ProjectComposeServiceDetails
        service={unknownService}
        isPending={false}
        isAvailable
        detailsId="project-compose-details-api-0"
        onStart={vi.fn()}
        onStop={vi.fn()}
        onRestart={vi.fn()}
        onLogs={vi.fn()}
      />
    );

    expect(markup).not.toContain("docker.compose.actions.start");
    expect(markup).not.toContain("docker.compose.actions.stop");
    expect(markup).not.toContain("docker.compose.actions.restart");
    expect(markup).toContain("docker.compose.actions.logs");
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
        publishers: []
      }]
    }]
  };
}
