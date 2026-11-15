// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenCodexRequest, OpenCodexSource } from "@open-codex-ui/opencodex-protocol";
import { RootStore } from "../src/stores/RootStore";
import { HomeProjectsViewX } from "../src/components/home/HomeProjectsView";
import { createDeferred, createProject } from "./ProjectGitReferencesStore.fixture";

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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Finds actions through visible text or their accessible name. */
function action(label: string): HTMLButtonElement {
  const element = [...document.querySelectorAll<HTMLElement>('button, [role="menuitem"]')]
    .find(item => item.textContent?.trim() === label || item.getAttribute("aria-label") === label);
  if (element === undefined) throw new Error(`Missing action ${label}`);
  return element as HTMLButtonElement;
}

/** Enters text through the real form's change handlers. */
function enter(label: string, value: string): void {
  const fieldLabel = [...document.querySelectorAll("label")].find(item => item.textContent?.startsWith(label));
  const input = document.getElementById(fieldLabel?.htmlFor ?? "") as HTMLInputElement | null;
  if (input === null) throw new Error(`Missing input ${label}`);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Builds genuine stores with host-local and WSL sources and no external effects. */
async function fixture() {
  const request = vi.fn(async (input: OpenCodexRequest): Promise<unknown> => {
    if (input.type === "projectGroups.list") return { groups: [], items: [] };
    if (input.type === "projects.pickDirectory") return null;
    throw new Error(`Unexpected request ${input.type}`);
  });
  const app = new RootStore({ request, onEvent: () => () => undefined });
  const base = { name: "Local", associatedProjectCount: 0, createdAt: "", updatedAt: "", resolvedCommand: "codex",
    commandCandidates: [], codex: { status: "ready" as const, version: "1", message: null, checkedAt: "" },
    codexUpdate: { supported: false, updateAvailable: false, latestVersion: null, checkedAt: null, message: null } };
  const sources: OpenCodexSource[] = [
    { ...base, id: "local", kind: "local", settings: { commandMode: "auto", command: null, color: "blue",
      openFileCommand: null, openFolderCommand: null } },
    { ...base, id: "wsl", name: "WSL", kind: "wsl", settings: { distro: "Ubuntu", codexCommand: "codex", color: "pink" } }
  ];
  app.sourcesStore.sources = sources;
  app.settings.defaultSourceId = "local";
  await act(async () => root.render(<HomeProjectsViewX store={app} />));
  return { app, request, clone: app.projectsStore.cloneStore };
}

describe("Home project addition", () => {
  it("should expose only add-project and group actions in the header and distinguish all three project choices", async () => {
    const test = await fixture();
    const header = container.querySelector("h2")!.parentElement!;
    expect(header.querySelectorAll("button")).toHaveLength(2);
    expect(action("home.createProjectGroup")).toBeDefined();

    await act(async () => action("home.addProject").click());
    expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(3);
    await act(async () => action("home.addExistingProject").click());
    expect(test.request).toHaveBeenCalledWith({ type: "projects.pickDirectory", mode: "open", sourceId: "local" });
    await act(async () => action("home.addProject").click());
    await act(async () => action("home.addBlankProject").click());
    expect(test.request).toHaveBeenCalledWith({ type: "projects.pickDirectory", mode: "create", sourceId: "local" });
    await act(async () => action("home.addProject").click());
    await act(async () => action("home.addGitProject").click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("home.cloneRepository");
    expect(test.request.mock.calls.some(([input]) => input.type === "projects.clone")).toBe(false);
  });

  it("should clone from the explicit form and keep it open with editing blocked until completion", async () => {
    const test = await fixture();
    const running = createDeferred<unknown>();
    test.request.mockImplementation(async input => {
      if (input.type === "projects.clone") return await running.promise;
      throw new Error(`Unexpected request ${input.type}`);
    });
    await act(async () => action("home.addProject").click());
    await act(async () => action("home.addGitProject").click());
    await act(async () => {
      enter("home.cloneRepository", "https://github.com/owner/repo.git");
      enter("home.cloneDestination", "C:\\projects\\repo");
    });
    await act(async () => action("home.cloneSubmit").click());

    const input = test.request.mock.calls.find(([request]) => request.type === "projects.clone")![0];
    expect(input).toEqual({ type: "projects.clone", sourceId: "local", repositoryUrl: "https://github.com/owner/repo.git",
      destinationPath: "C:\\projects\\repo" });
    expect(() => structuredClone(input)).not.toThrow();
    expect(action("home.cloneCancel").disabled).toBe(true);
    expect(action("home.cloneSubmit").disabled).toBe(true);
    await act(async () => { action("home.cloneSubmit").click(); test.clone.setSourceId("wsl"); });
    expect(test.clone.sourceId).toBe("local");
    expect(test.request.mock.calls.filter(([request]) => request.type === "projects.clone")).toHaveLength(1);

    vi.useFakeTimers();
    await act(async () => running.resolve(createProject()));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(test.clone.isBusy).toBe(false);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(action("home.addProject").disabled).toBe(false);
  });

  it("should preserve failed inputs and allow correction without adding a phantom project", async () => {
    const test = await fixture();
    await act(async () => action("home.addProject").click());
    await act(async () => action("home.addGitProject").click());
    await act(async () => {
      test.clone.setRepositoryUrl("git@example.test:owner/repo.git");
      test.clone.setDestinationPath("C:\\projects\\existing");
    });
    test.request.mockRejectedValueOnce(new Error("Destination directory is not empty"));
    await act(async () => action("home.cloneSubmit").click());

    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Destination directory is not empty");
    expect(test.clone.repositoryUrl).toBe("git@example.test:owner/repo.git");
    expect(test.clone.destinationPath).toBe("C:\\projects\\existing");
    expect(test.app.projectsStore.projects).toEqual([]);
    expect(action("home.cloneSubmit").disabled).toBe(false);
    await act(async () => test.clone.setSourceId("wsl"));
    expect(test.clone.destinationPath).toBe("");
    expect(test.clone.canPickFolder).toBe(false);
    expect(document.body.textContent).not.toContain("home.clonePickFolder");
  });
});
