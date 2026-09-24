import { describe, test, expect, vi } from "vitest";
import type { DebugSessionSnapshot, OpenCodexProject, OpenCodexRequest, DebugSnapshot } from "@open-codex-ui/opencodex-protocol";
import { RootStore } from "../src/stores/RootStore";
import { openDebugSource, workspaceRelativeSource } from "../src/stores/debug/debugDocuments";

const context = { sourceId: "local", projectId: "project", workspaceId: "one", workspacePath: "/project" };
const session: DebugSessionSnapshot = { id: "session", configuration: { id: "config", name: "Test",
  adapter: "javascript", context, request: "launch", target: "node", program: "main.js" },
  state: "paused", epoch: 1, capabilities: {}, breakpoints: [], output: [] };
const preferences = { configurations: [], breakpoints: [], watches: [] };

/** Uses actual file/navigation stores while replacing only the backend transport. */
function fixture() {
  const request = vi.fn(async (request: OpenCodexRequest): Promise<unknown> => {
    if (request.type === "workspaceFiles.read") return { ok: true, value: {
      content: "disk", revision: "one", bom: false, eol: "lf", readOnly: false
    } };
    if (request.type === "debug") return { threads: [], scopes: [], variables: [] };
    return [];
  });
  const root = new RootStore({ request: request as never, onEvent: () => () => undefined });
  const project = root.projectsStore.openProjectTab({ id: "project", sourceId: "local", path: "/project",
    defaultName: "Project", displayName: null, isHidden: false, preferences: {}, createdAt: "", updatedAt: "",
    lastSeenAt: "", editedAt: "" } as OpenCodexProject, true);
  return { root, project, store: root.debugStore, request };
}

describe("debug documents and lifecycle", () => {
  test("preserves dirty files and reuses the same read-only executed source on later pauses", async () => {
    const { project, store } = fixture();
    await project.files.open({ ...context, path: "main.js" }, "Main");
    const original = project.files.active!;
    original.edit("valuable draft");
    await openDebugSource(store, session, { path: "/project/main.js", name: "main.js" }, "executed", 2, 1, () => true);
    const executed = project.files.active!;
    expect(executed).not.toBe(original);
    expect(executed.isReadOnly).toBe(true);
    expect(original.content).toBe("valuable draft");
    expect(executed.name).toContain("Debug");
    project.files.showChat();
    await openDebugSource(store, { ...session, epoch: 2 }, { path: "/project/main.js", name: "main.js" }, "executed", 3, 1, () => true);
    expect(project.files.active).toBe(executed);
    expect(executed.position?.line).toBe(3);
    expect(project.files.documents.size).toBe(2);
  });
  test("keeps worktree breakpoints separate and clears execution annotations on continue", async () => {
    const { project, store } = fixture();
    await project.files.open({ ...context, path: "main.js" }, "Main");
    const document = project.files.active!;
    store.snapshot = { revision: 1, session, preferences: { ...preferences, breakpoints: [
      { id: "other", context: { ...context, workspaceId: "two" }, path: "main.js", line: 8, enabled: true },
      { id: "own", context, path: "main.js", line: 2, enabled: false }
    ] } };
    store.execution = { documentId: document.id, line: 3 };
    expect(document.gutter?.markers.map(item => item.kind)).toEqual(["disabled", "execution"]);
    store.apply({ ...store.snapshot, revision: 2, session: { ...session, state: "running", epoch: 2 } });
    expect(document.gutter?.markers.map(item => item.kind)).toEqual(["disabled"]);
  });
  test("ignores older snapshots and late variable replies after continue", async () => {
    const { store, request } = fixture();
    store.snapshot = { revision: 5, session, preferences };
    let reply!: (value: unknown) => void;
    request.mockImplementationOnce(() => new Promise(resolve => { reply = resolve; }));
    const pending = store.variables(7);
    store.apply({ revision: 6, session: { ...session, epoch: 2, state: "running" }, preferences });
    store.apply({ revision: 4, session, preferences });
    reply({ variables: [{ name: "stale" }] });
    await expect(pending).rejects.toThrow("expired");
    expect(store.snapshot.session?.state).toBe("running");
  });
  test("does not navigate for a stale source result or lose sessions when returning to chat", async () => {
    const { store, project, root } = fixture();
    store.snapshot = { revision: 1, session, preferences };
    await openDebugSource(store, session, { name: "generated.js", sourceReference: 99 }, "source", 1, 1, () => false);
    expect(project.files.documents.size).toBe(0);
    project.files.showChat();
    expect(store.active).toBe(true);
    root.navigationStore.requestCloseProject("project");
    root.navigationStore.confirmCloseProject();
    expect(root.projectsStore.projectStoresById.has("project")).toBe(true);
  });
  test("converts nested observable configuration data to plain transport payloads", async () => {
    const { store, request } = fixture();
    request.mockResolvedValue({ revision: 1, session: null, preferences } satisfies DebugSnapshot);
    store.snapshot.preferences.configurations.push(session.configuration);
    await store.saveConfiguration(store.snapshot.preferences.configurations[0]);
    expect(() => structuredClone(request.mock.calls[0][0])).not.toThrow();
  });
  test("matches Windows source casing without treating sibling paths as workspace files", () => {
    expect(workspaceRelativeSource("C:\\Code", "c:\\code\\src\\app.ts")).toBe("src/app.ts");
    expect(workspaceRelativeSource("/project", "/project-other/app.js")).toBeNull();
    expect(workspaceRelativeSource("/project", "/project/../outside.js")).toBeNull();
  });
});
