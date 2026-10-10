import { describe, expect, it, vi } from "vitest";

import type {
  OpenCodexApplicationCloseRequest,
  OpenCodexClientTransport,
  OpenCodexProject
} from "@open-codex-ui/opencodex-protocol";

import { RootStore } from "../src/stores/RootStore";

describe("RootStore project activity", () => {
  it("should show rejected link and editor launches in the interface without an unhandled rejection", async () => {
    const request = vi.fn().mockRejectedValue(new Error("Unable to start file opener: code ENOENT"));
    const root = new RootStore({ request, onEvent: vi.fn(() => () => undefined) });

    root.openLink("C:/images/image.png", null, null, "local");
    await vi.waitFor(() => expect(root.appStore.errorMessage).toContain("code ENOENT"));
    root.appStore.clearErrorMessage();
    root.openExternalLink("C:/images/image.png");
    await vi.waitFor(() => expect(root.appStore.errorMessage).toContain("code ENOENT"));
    root.appStore.clearErrorMessage();
    root.openProjectInIde("C:/work", "local");
    await vi.waitFor(() => expect(root.appStore.errorMessage).toContain("code ENOENT"));
  });

  it("should aggregate project tool activity for the host lifecycle", () => {
    const reportApplicationActivity = vi.fn();
    const root = new RootStore(createTransport(reportApplicationActivity));
    const projectStore = root.projectsStore.openProjectTab(createProject(), false);

    expect(root.hasPendingProjectActivity).toBe(false);

    projectStore.gitStore.commitStore.setCommitMessage("Draft commit");

    expect(root.hasPendingProjectActivity).toBe(true);

    root.reportApplicationActivity();

    expect(reportApplicationActivity).toHaveBeenCalledWith({
      hasPendingProjectActivity: true
    });
  });

  it("should expose and answer a native application close request", () => {
    let closeRequestListener: ((request: OpenCodexApplicationCloseRequest) => void) | null = null;
    const respondToApplicationClose = vi.fn();
    const root = new RootStore({
      request: vi.fn(async () => undefined),
      onEvent: vi.fn(() => () => undefined),
      onApplicationCloseRequested: (listener) => {
        closeRequestListener = listener;
        return () => undefined;
      },
      respondToApplicationClose
    });

    closeRequestListener?.({
      hasActiveTurns: true,
      hasPendingProjectActivity: false
    });

    expect(root.applicationCloseRequest).toEqual({
      hasActiveTurns: true,
      hasPendingProjectActivity: false
    });

    root.respondToApplicationClose(false);

    expect(root.applicationCloseRequest).toBeNull();
    expect(respondToApplicationClose).toHaveBeenCalledWith(false);
  });
});

/** Creates an inert transport that records lifecycle activity reports. */
function createTransport(
  reportApplicationActivity: OpenCodexClientTransport["reportApplicationActivity"]
): OpenCodexClientTransport {
  return {
    request: vi.fn(async () => undefined),
    onEvent: vi.fn(() => () => undefined),
    reportApplicationActivity
  };
}

/** Creates deterministic project metadata for aggregation tests. */
function createProject(): OpenCodexProject {
  return {
    id: "project-1",
    sourceId: "source-1",
    path: "/workspace/project",
    defaultName: "Project",
    displayName: null,
    isHidden: false,
    preferences: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    editedAt: "2026-01-01T00:00:00.000Z"
  };
}
