// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "@mui/material";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observable, runInAction } from "mobx";
import type { OpenCodexRequest, OpenCodexSource } from "@open-codex-ui/opencodex-protocol";
import { HomeProjectListItem } from "../src/components/home/HomeProjectListItem";
import { HomeProjectTreeList } from "../src/components/home/HomeProjectTreeList";
import { HomeProjectsViewX } from "../src/components/home/HomeProjectsView";
import { createOpenCodexTheme } from "../src/theme";
import { frNavigation } from "../src/i18n/locales/fr/navigation";
import { frGit } from "../src/i18n/locales/fr/git";
import { frGitSync } from "../src/i18n/locales/fr/gitSync";
import { RootStore } from "../src/stores/RootStore";
import { createHomeProjectGitFixture, settleHomeGit } from "./HomeProjectGit.fixture";
import { createFile, createStatus, createProject } from "./ProjectGitStatusStore.fixture";

/** Makes viewport transitions explicit; mounting an offscreen row must not start a request. */
class ViewportObserver {
  /** Row anchor passed by the actual indicator effect. */
  target: Element | null = null;
  /** Lifecycle spy verifies that leaving Home releases the observation. */
  disconnect = vi.fn();
  /** Captures callbacks without relying on jsdom layout. */
  constructor(private readonly callback: IntersectionObserverCallback) { observers.push(this); }
  /** Retains the row so tests can drive its visibility independently. */
  observe(target: Element): void { this.target = target; }
  /** Delivers one deterministic viewport observation. */
  setVisible(isIntersecting: boolean): void {
    this.callback([{ isIntersecting, target: this.target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver);
  }
}

let root: Root;
let container: HTMLDivElement;
let observers: ViewportObserver[];
const language = createInstance();

beforeEach(async () => {
  observers = [];
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("IntersectionObserver", ViewportObserver);
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-18T12:00:00Z"));
  await language.init({ lng: "fr", resources: { fr: { translation: { ...frNavigation, ...frGit, ...frGitSync } } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Renders the complete row so the indicator's position and project action remain integrated. */
async function renderRow(status = createStatus()) {
  const test = createHomeProjectGitFixture();
  test.root.projectsStore.projects = observable(test.projects);
  const project = test.projects[0]!;
  const onOpen = vi.fn();
  test.store.record(project.id, project.path, project.sourceId, status);
  await act(async () => root.render(
    <I18nextProvider i18n={language}><ThemeProvider theme={createOpenCodexTheme("light")}>
      <HomeProjectListItem project={project} depth={0} sourceName="Local" sourceColor="blue"
        gitIndicators={test.store} onOpen={onOpen} onSetHidden={vi.fn()} onDelete={vi.fn()} onOrganize={vi.fn()} />
    </ThemeProvider></I18nextProvider>
  ));
  return { ...test, project, onOpen };
}

describe("Home Git indicators", () => {
  it("should react to deferrals without another Git read and keep outgoing commits visible", async () => {
    const status = createStatus({ changedFiles: [createFile("local.env")] });
    const test = await renderRow(status);
    expect(container.querySelector('[role="img"]')).not.toBeNull();
    await act(async () => runInAction(() => {
      test.root.projectsStore.projects[0]!.preferences = { git: { deferredPaths: ["local.env"] } };
    }));
    expect(container.querySelector('[role="img"]')).toBeNull();
    await act(async () => test.store.record(test.project.id, test.project.path, test.project.sourceId,
      { ...status, aheadCount: 2 }));
    const icon = container.querySelector<HTMLElement>('[role="img"]')!;
    expect(icon.getAttribute("aria-label")).toContain("Push 2 commits");
    expect(icon.getAttribute("aria-label")).not.toContain("Modifications non enregistrées");
    expect(getComputedStyle(icon).color).toBe("rgb(9, 105, 218)");
    await act(async () => runInAction(() => { test.root.projectsStore.projects[0]!.preferences = {}; }));
    expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toContain("Modifications non enregistrées");
    expect(test.request).not.toHaveBeenCalled();
  });

  it("should show uncommitted files in gray at the end of the project row", async () => {
    const test = await renderRow(createStatus({ stagedFiles: [createFile("staged.ts")] }));
    const icon = container.querySelector<HTMLElement>('[role="img"]')!;
    expect(icon.getAttribute("aria-label")).toBe("Modifications non enregistrées dans Git");
    expect(getComputedStyle(icon).color).toBe("rgb(107, 114, 128)");
    const actions = container.querySelector('button[aria-label="Actions du projet"]')!;
    expect(icon.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    await act(async () => icon.click());
    expect(test.onOpen).toHaveBeenCalledWith(test.project.path, test.project.sourceId);
    expect(test.request).not.toHaveBeenCalled();
  });

  it("should prioritize blue for outgoing commits while retaining the uncommitted explanation", async () => {
    const test = await renderRow(createStatus({ aheadCount: 2, changedFiles: [createFile("local.ts")] }));
    const icon = container.querySelector<HTMLElement>('[role="img"]')!;
    expect(icon.getAttribute("aria-label")).toContain("Push 2 commits");
    expect(icon.getAttribute("aria-label")).toContain("Modifications non enregistrées");
    expect(getComputedStyle(icon).color).toBe("rgb(9, 105, 218)");
    await act(async () => test.store.record(test.project.id, test.project.path, test.project.sourceId, createStatus()));
    expect(container.querySelector('[role="img"]')).toBeNull();
  });

  it("should leave clean and nonrepository rows without a Git alert", async () => {
    const test = await renderRow();
    expect(container.querySelector('[role="img"]')).toBeNull();
    await act(async () => test.store.record(test.project.id, test.project.path, test.project.sourceId,
      createStatus({ isRepository: false })));
    expect(container.querySelector('[role="img"]')).toBeNull();
  });

  it("should check only visible nested rows and disconnect them when the list unmounts", async () => {
    const test = createHomeProjectGitFixture(2);
    test.request.mockResolvedValue(createStatus({ aheadCount: 1 }));
    const branches = test.projects.map(project => ({
      node: { type: "project" as const, project, depth: 1, groupId: "group" }, children: []
    }));
    await act(async () => root.render(<I18nextProvider i18n={language}>
      <HomeProjectTreeList branches={branches} sourceById={new Map()} gitIndicators={test.store}
        onOpenProject={vi.fn()} onSetProjectHidden={vi.fn()} onDeleteProject={vi.fn()} onOrganizeProject={vi.fn()}
        onToggleGroup={vi.fn()} onRenameGroup={vi.fn()} onDeleteGroup={vi.fn()} />
    </I18nextProvider>));
    expect(test.request).not.toHaveBeenCalled();
    await act(async () => { observers[1]!.setVisible(true); await settleHomeGit(); });
    expect(test.request).toHaveBeenCalledOnce();
    expect(test.request).toHaveBeenCalledWith({ type: "git.status", sourceId: "source-1", projectPath: "/repo/1" });
    expect(container.querySelectorAll('[role="img"]')).toHaveLength(1);
    await act(async () => root.render(<></>));
    expect(observers.every(observer => observer.disconnect.mock.calls.length === 1)).toBe(true);
    test.store.refreshVisible(true);
    expect(test.request).toHaveBeenCalledOnce();
  });

  it("should display a failed source read as unknown instead of suggesting a clean project", async () => {
    const test = await renderRow();
    test.advance(60_000);
    test.request.mockRejectedValueOnce(new Error("Raw transport failure"));
    await act(async () => { observers[0]!.setVisible(true); await settleHomeGit(); });
    const icon = container.querySelector<HTMLElement>('[role="img"]')!;
    expect(icon.getAttribute("aria-label")).toContain("État Git indisponible");
    expect(icon.getAttribute("aria-label")).not.toContain("Raw transport");
    expect(getComputedStyle(icon).color).toBe("rgb(237, 108, 2)");
  });

  it("should force a visible Git check from Home refresh without opening project tabs", async () => {
    const project = { ...createProject(), sourceId: "local" };
    const request = vi.fn(async (input: OpenCodexRequest): Promise<unknown> => {
      if (input.type === "projectGroups.list") return { groups: [], items: [] };
      if (input.type === "projects.list") return [project];
      if (input.type === "git.status") return createStatus({ aheadCount: 2 });
      throw new Error(`Unexpected request ${input.type}`);
    });
    const app = new RootStore({ request, onEvent: () => () => undefined });
    app.projectsStore.projects = [project];
    app.sourcesStore.sources = [{ id: "local", name: "Local", settings: { color: "blue" },
      codex: { status: "ready" } } as OpenCodexSource];
    await act(async () => root.render(<I18nextProvider i18n={language}><HomeProjectsViewX store={app} /></I18nextProvider>));
    expect(request.mock.calls.some(([input]) => input.type === "git.status")).toBe(false);
    await act(async () => { observers[0]!.setVisible(true); await settleHomeGit(); });
    expect(request.mock.calls.filter(([input]) => input.type === "git.status")).toHaveLength(1);
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(request.mock.calls.filter(([input]) => input.type === "git.status")).toHaveLength(1);
    const refresh = container.querySelector<HTMLButtonElement>('button[title="Synchroniser les projets récents"]')!;
    await act(async () => { refresh.click(); await settleHomeGit(); });
    expect(request.mock.calls.filter(([input]) => input.type === "git.status")).toHaveLength(2);
    expect(app.projectsStore.projectStoresById.size).toBe(0);
    expect(request.mock.calls.every(([input]) => ["projectGroups.list", "projects.list", "git.status"].includes(input.type))).toBe(true);
  });
});
