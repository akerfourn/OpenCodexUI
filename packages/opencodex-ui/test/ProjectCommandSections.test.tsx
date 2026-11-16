// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { OpenCodexProjectCommand } from "@open-codex-ui/opencodex-protocol";
import type { ProjectCommandsStore } from "../src/stores/project/ProjectCommandsStore";
import { ProjectCommandSectionsX } from "../src/components/projects/ProjectCommandSections";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

/** Uses real cards and collapsible groups, isolating only command transport and execution. */
async function fixture() {
  const base = { projectId: "project", command: "just --justfile tools/very_long_path/".repeat(20),
    executionMode: "project" as const, persistLogs: false, createdAt: "", updatedAt: "", sortOrder: 0 };
  const commands: OpenCodexProjectCommand[] = [
    { ...base, id: "build", name: "Build command", groupName: "Build" },
    { ...base, id: "plain", name: "Plain command" },
    { ...base, id: "favorite", name: "Favorite command", groupName: "Build", isFavorite: true },
    { ...base, id: "looseFavorite", name: "Ungrouped favorite command", isFavorite: true }
  ];
  const toggleFavorite = vi.fn();
  const moveCommand = vi.fn();
  const store = { commands, isSaving: false, canRunCommand: () => true, getRuns: () => [],
    hasRunningRuns: () => false, toggleFavorite, moveCommand,
    groups: { names: ["Build"], isSaving: false } } as unknown as ProjectCommandsStore;
  await act(async () => root.render(<ProjectCommandSectionsX commandsStore={store} onCreate={vi.fn()} onEdit={vi.fn()} onOpenLogs={vi.fn()} />));
  return { commands, toggleFavorite, moveCommand };
}

it("should show favorites then initially collapsed groups then ungrouped commands", async () => {
  await fixture();
  const names = [...container.querySelectorAll('.project-command-card [title$="command"]')].map(element => element.textContent);
  expect(names).toEqual(["Favorite command", "Ungrouped favorite command", "Plain command"]);
  const summary = container.querySelector<HTMLElement>('button[aria-controls][aria-expanded="false"]')!;
  expect(summary.textContent).toContain("Build");
  const plain = container.querySelector('[title="Plain command"]')!;
  expect(summary.compareDocumentPosition(plain) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  await act(async () => summary.click());
  expect(summary.getAttribute("aria-expanded")).toBe("true");
  const expandedNames = [...container.querySelectorAll('.project-command-card [title$="command"]')]
    .map(element => element.textContent);
  expect(expandedNames).toEqual([
    "Favorite command", "Ungrouped favorite command", "Build command", "Favorite command", "Plain command"
  ]);
  expect(summary.textContent).toContain("2");
});

it("should reorder a grouped favorite relative to the list whose action was used", async () => {
  const { moveCommand } = await fixture();
  const summary = container.querySelector<HTMLElement>('button[aria-controls]')!;
  await act(async () => summary.click());
  const cards = [...container.querySelectorAll('[title="Favorite command"]')]
    .map(title => title.closest('.project-command-card')!);
  await act(async () => cards[1]!.querySelector<HTMLButtonElement>('button[aria-label="commands.actions"]')!.click());
  const groupMove = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    .find(item => item.textContent === "commands.moveUp")!;
  await act(async () => groupMove.click());
  expect(moveCommand).toHaveBeenLastCalledWith("favorite", "up", ["build", "favorite"]);

  await act(async () => cards[0]!.querySelector<HTMLButtonElement>('button[aria-label="commands.actions"]')!.click());
  const favoriteMove = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    .find(item => item.textContent === "commands.moveDown")!;
  await act(async () => favoriteMove.click());
  expect(moveCommand).toHaveBeenLastCalledWith("favorite", "down", ["favorite", "looseFavorite"]);
});

it("should expose favorite toggling without hiding the full long command", async () => {
  const { commands, toggleFavorite } = await fixture();
  const favorite = container.querySelector<HTMLButtonElement>('button[aria-label="commands.removeFavorite"]')!;
  await act(async () => favorite.click());
  expect(toggleFavorite).toHaveBeenCalledWith(commands[2]);
  const description = container.querySelector<HTMLElement>('.project-command-card .MuiTypography-caption[title]')!;
  expect(description.tagName).toBe("DIV");
  expect(description.title).toBe(commands[0]!.command);
  expect(description.className).toContain("MuiTypography-noWrap");
});
