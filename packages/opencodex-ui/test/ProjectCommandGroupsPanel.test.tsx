// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenCodexProjectCommand, OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";
import { ProjectCommandsPanelX } from "../src/components/projects/ProjectCommandsPanel";
import { ProjectCommandsStore } from "../src/stores/project/ProjectCommandsStore";
import type { ProjectStore } from "../src/stores/project/ProjectStore";
import type { RootStore } from "../src/stores/RootStore";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
let root: Root;
let container: HTMLDivElement;

/** Creates a small explicit command snapshot without starting any process. */
function command(id = "command", groupName: string | null = null, isFavorite = false): OpenCodexProjectCommand {
  return { id, projectId: "project", name: id, command: "just build", executionMode: "project", persistLogs: false,
    groupName, isFavorite, sortOrder: 0, createdAt: "", updatedAt: "" };
}

/** Finds user actions by their accessible translated label. */
function action(label: string, scope: ParentNode = document): HTMLElement {
  const match = Array.from(scope.querySelectorAll<HTMLElement>('button,[role="menuitem"]'))
    .find(item => item.getAttribute("aria-label") === label || item.textContent === label);
  if (match === undefined) throw new Error(`Missing action ${label}`);
  return match;
}

/** Types through React's real controlled-input handling. */
async function type(label: string, value: string): Promise<void> {
  const field = Array.from(document.querySelectorAll("label")).find(item => item.textContent === label)!;
  const input = document.getElementById(field.htmlFor) as HTMLInputElement | HTMLTextAreaElement;
  let prototype = HTMLInputElement.prototype;
  if (input instanceof HTMLTextAreaElement) prototype = HTMLTextAreaElement.prototype as unknown as typeof prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Uses real stores/cards/dialogs with a deterministic in-memory transport. */
async function fixture(initialNames: string[] = [], initialCommands: OpenCodexProjectCommand[] = []) {
  let names = [...initialNames];
  let commands = structuredClone(initialCommands);
  const request = vi.fn(async (request: OpenCodexRequest): Promise<unknown> => {
    if (request.type === "projectCommands.groups.create") names.push(request.name);
    if (request.type === "projectCommands.groups.rename") {
      names = names.map(name => name === request.name ? request.newName : name);
      commands = commands.map(item => item.groupName === request.name ? { ...item, groupName: request.newName } : item);
    }
    if (request.type === "projectCommands.groups.delete") {
      names = names.filter(name => name !== request.name);
      commands = commands.map(item => item.groupName === request.name ? { ...item, groupName: null } : item);
    }
    if (request.type === "projectCommands.groups.assign") {
      commands = commands.map(item => item.id === request.commandId ? { ...item, groupName: request.name } : item);
      return structuredClone(commands.find(item => item.id === request.commandId));
    }
    if (request.type.startsWith("projectCommands.groups.")) return [...names];
    if (request.type === "projectCommands.list") return structuredClone(commands);
    if (request.type === "projectCommands.create") {
      const created = { ...command("new-command"), ...request, id: "new-command" };
      commands.push(created);
      return structuredClone(created);
    }
    throw new Error(`Unexpected request ${request.type}`);
  });
  const project = { project: { id: "project", sourceId: "source", path: "/repo" }, projectPath: "/repo",
    isCodexSourceReady: true, workspaces: { workspaces: [] } } as unknown as ProjectStore;
  const store = new ProjectCommandsStore(project, { request, appStore: { errorMessage: null } } as unknown as RootStore);
  Object.assign(project, { commandsStore: store });
  await act(async () => root.render(<ProjectCommandsPanelX projectStore={project} />));
  return { store, request };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("integrated command group controls", () => {
  it("should create an empty group inline without creating a placeholder command", async () => {
    const { store, request } = await fixture();
    await act(async () => action("commands.createGroup").click());
    await type("commands.groupName", "Build");
    await act(async () => action("commands.save").click());
    expect(store.groups.names).toEqual(["Build"]);
    expect(store.commands).toEqual([]);
    expect(container.textContent).toContain("Build");
    expect(request).toHaveBeenCalledWith({ type: "projectCommands.groups.create", projectId: "project", name: "Build" });
    expect(request.mock.calls.some(([input]) => input.type === "projectCommands.create")).toBe(false);
  });

  it("should create a command directly in the chosen group using a selection rather than a free text field", async () => {
    const { request } = await fixture(["Build"]);
    await act(async () => action("commands.addInGroup").click());
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector('[role="combobox"]')?.textContent).toBe("Build");
    await type("commands.name", "Compile");
    await type("commands.command", "just compile");
    await act(async () => action("commands.save", dialog).click());
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ type: "projectCommands.create", groupName: "Build", name: "Compile" }));
  });

  it("should move a command from its side action menu with a minimal metadata request", async () => {
    const { store, request } = await fixture(["Build"], [command()]);
    const card = container.querySelector('.project-command-card')!;
    expect(card.querySelector('.project-command-card-main > .project-command-actions')).not.toBeNull();
    await act(async () => action("commands.actions", card).click());
    await act(async () => action("Build").click());
    expect(request).toHaveBeenCalledWith({ type: "projectCommands.groups.assign", projectId: "project", commandId: "command", name: "Build" });
    expect(store.commands[0]).toMatchObject({ groupName: "Build", command: "just build", isFavorite: false });
  });

  it("should rename then delete a group in the panel while retaining commands and favorite placement", async () => {
    const { store, request } = await fixture(["Build"], [command("ordinary", "Build"), command("favorite", "Build", true)]);
    await act(async () => action("commands.groupActions").click());
    await act(async () => action("commands.renameGroup").click());
    await type("commands.groupName", "Release");
    await act(async () => action("commands.save").click());
    expect(store.groups.names).toEqual(["Release"]);
    expect(store.commands.every(item => item.groupName === "Release")).toBe(true);
    await act(async () => action("commands.groupActions").click());
    const removal = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .find(item => item.textContent?.includes("commands.deleteGroup"))!;
    await act(async () => removal.click());
    expect(store.groups.names).toEqual([]);
    expect(store.commands).toHaveLength(2);
    expect(store.commands.find(item => item.id === "favorite")).toMatchObject({ isFavorite: true, groupName: null });
    expect(request.mock.calls.some(([input]) => input.type === "projectCommands.delete")).toBe(false);
  });
});
