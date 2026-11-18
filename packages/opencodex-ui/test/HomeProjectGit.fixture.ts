import { vi } from "vitest";
import type { RootStore } from "../src/stores/RootStore";
import { HomeProjectGitStore } from "../src/stores/app/HomeProjectGitStore";
import { createProject } from "./ProjectGitStatusStore.fixture";

/** Explicit metadata and injectable time isolate Home reads from source startup and filesystem I/O. */
export function createHomeProjectGitFixture(count = 1) {
  const projects = Array.from({ length: count }, (_, index) => ({
    ...createProject(), id: `project-${index}`, path: `/repo/${index}`, sourceId: `source-${index}`
  }));
  const readySources = new Set(projects.map(project => project.sourceId));
  const request = vi.fn();
  const surface = {
    request,
    projectsStore: { projects },
    sourcesStore: { isSourceReady: (id: string) => readySources.has(id) },
    sourceInstancesStore: { states: new Map() },
    appStore: { settingsStore: { settings: { versioningVocabulary: "technical" } } }
  };
  let time = Date.parse("2026-11-18T12:00:00Z");
  const root = surface as unknown as RootStore;
  const store = new HomeProjectGitStore(root, () => time);
  Object.assign(surface.projectsStore, { gitIndicators: store });
  return { root, store, request, projects, readySources, advance: (milliseconds: number) => { time += milliseconds; } };
}

/** Drains transport continuations and the bounded scheduler without real timers. */
export async function settleHomeGit(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}
