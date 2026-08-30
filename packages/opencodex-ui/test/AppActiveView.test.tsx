/**
 * Verifies that the application mounts only its active heavyweight view.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ProjectStore } from "../src/stores/project/ProjectStore";
import type { RootStore } from "../src/stores/RootStore";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock("../src/components/app/AppTabs", () => ({
  AppTabsX: () => <div data-testid="tabs" />
}));
vi.mock("../src/components/home/HomeView", () => ({
  HomeViewX: () => <div data-testid="home-view" />
}));
vi.mock("../src/components/projects/ProjectView", () => ({
  ProjectViewX: ({ projectStore }: { projectStore: ProjectStore }) => (
    <div data-project-view={projectStore.project.id} />
  )
}));
vi.mock("../src/components/onboarding/OnboardingView", () => ({
  OnboardingViewX: () => <div data-testid="onboarding" />
}));
vi.mock("../src/components/dialogs/ApprovalDialog", () => ({
  ApprovalDialogX: () => null
}));
vi.mock("../src/components/dialogs/ProjectTrustDialog", () => ({
  ProjectTrustDialogX: () => null
}));
vi.mock("../src/components/dialogs/CloseProjectDialog", () => ({
  CloseProjectDialogX: () => null
}));

import { App } from "../src/components/App";

describe("App active view", () => {
  it("should mount only the selected project view", () => {
    const firstProject = createProjectStore("project-1");
    const secondProject = createProjectStore("project-2");
    const store = createRootStore("project-2", secondProject, [firstProject, secondProject]);

    const markup = renderToStaticMarkup(<App store={store} />);

    expect(markup).toContain("data-project-view=\"project-2\"");
    expect(markup).not.toContain("data-project-view=\"project-1\"");
    expect(markup).not.toContain("data-testid=\"home-view\"");
  });

  it("should unmount every project view while Home is active", () => {
    const projectStore = createProjectStore("project-1");
    const store = createRootStore("home", null, [projectStore]);

    const markup = renderToStaticMarkup(<App store={store} />);

    expect(markup).toContain("data-testid=\"home-view\"");
    expect(markup).not.toContain("data-project-view");
  });
});

/**
 * Creates the minimal project store shape consumed by the mocked view.
 *
 * @param projectId Project identifier.
 * @returns Project store fixture.
 */
function createProjectStore(projectId: string): ProjectStore {
  return {
    project: { id: projectId }
  } as ProjectStore;
}

/**
 * Creates the minimal root store shape consumed by App.
 *
 * @param activeTabId Selected tab identifier.
 * @param activeProjectStore Selected project store.
 * @param projectTabStores Open project stores.
 * @returns Root store fixture.
 */
function createRootStore(
  activeTabId: string,
  activeProjectStore: ProjectStore | null,
  projectTabStores: ProjectStore[]
): RootStore {
  return {
    appStore: {
      errorMessage: null,
      warningMessage: null,
      isShuttingDown: false,
      shouldShowOnboarding: false,
      clearErrorMessage: vi.fn(),
      clearWarningMessage: vi.fn()
    },
    navigationStore: {
      activeTabId,
      activeProjectStore,
      projectTabStores
    },
    approvalsStore: {},
    projectsStore: { trustStore: {} },
    openLogsHome: vi.fn()
  } as unknown as RootStore;
}
