import { describe, expect, it } from "vitest";
import { isObservable, observable } from "mobx";
import { createDebugAdvancedDraft, hasNodeAdvancedDraft, parseDebugAdvancedDraft } from "../src/stores/debug/debugAdvancedDraft";
import { debugPayload } from "../src/stores/debug/debugPayload";
import { debugAdvancedSchema } from "../src/components/debug/debugAdvancedSchema";

describe("advanced debug draft", () => {
  it("should round-trip form and JSON fields including empty and removed environment variables", () => {
    const options = { env: { MODE: "test", EMPTY: "", REMOVE: null }, envFile: ".env", runtimeArgs: ["--no-warnings"],
      stopOnEntry: true, sourceMaps: false, skipFiles: ["<node_internals>/**"] };
    const draft = createDebugAdvancedDraft(options);
    expect(parseDebugAdvancedDraft(draft, "node", "launch")).toEqual(options);
    expect(JSON.parse(draft.json)).toEqual({ sourceMaps: false, skipFiles: ["<node_internals>/**"] });
  });

  it("should retain invalid buffers while rejecting duplicate fields, duplicate environment keys and unsupported options", () => {
    const draft = createDebugAdvancedDraft();
    draft.json = "{\n invalid";
    expect(() => parseDebugAdvancedDraft(draft, "node", "launch")).toThrow(SyntaxError);
    expect(draft.json).toBe("{\n invalid");
    draft.json = '{"envFile":".env"}';
    expect(() => parseDebugAdvancedDraft(draft, "node", "launch")).toThrow("dedicated form");
    draft.json = '{"console":"integratedTerminal"}';
    expect(() => parseDebugAdvancedDraft(draft, "node", "launch")).toThrow("Unsupported advanced option");
    draft.json = "{}";
    draft.environment = [
      { id: "a", name: "MODE", value: "test", unset: false },
      { id: "b", name: "MODE", value: "", unset: true }
    ];
    expect(() => parseDebugAdvancedDraft(draft, "node", "launch")).toThrow("must be unique");
  });

  it("should require explicit removal of Node fields when the user switches target or request", () => {
    const draft = createDebugAdvancedDraft({ envFile: ".env", sourceMaps: true });
    expect(hasNodeAdvancedDraft(draft)).toBe(true);
    expect(() => parseDebugAdvancedDraft(draft, "chrome", "launch")).toThrow("only available");
    expect(draft.envFile).toBe(".env");
    draft.envFile = "";
    expect(parseDebugAdvancedDraft(draft, "chrome", "attach")).toEqual({ sourceMaps: true });
  });

  it("should detach all nested observable options before transport and preserve subsequent edits locally", () => {
    const configuration = observable({ id: "node", name: "Node", adapter: "javascript" as const,
      context: { sourceId: "local", projectId: "p", workspaceId: "w", workspacePath: "/project" },
      target: "node" as const, request: "launch" as const, program: "main.js",
      advanced: { env: { MODE: "test" }, runtimeArgs: ["--no-warnings"], sourceMapPathOverrides: { "source/*": "/local/*" } } });
    const action = debugPayload({ kind: "saveConfiguration", configuration });
    if (action.kind !== "saveConfiguration") throw new Error("Wrong action");
    const advanced = action.configuration.advanced!;
    expect(isObservable(advanced.env)).toBe(false);
    expect(isObservable(advanced.runtimeArgs)).toBe(false);
    expect(isObservable(advanced.sourceMapPathOverrides)).toBe(false);
    expect(() => structuredClone(action)).not.toThrow();
    configuration.advanced.env.MODE = "changed";
    expect(advanced.env?.MODE).toBe("test");
  });

  it("should complete only JSON-owned fields and reject unknown schema properties", () => {
    const schema = debugAdvancedSchema({ skipFiles: "Skip matching sources" });
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties).toHaveProperty("skipFiles.description", "Skip matching sources");
    expect(schema.properties).not.toHaveProperty("env");
    expect(schema.properties).not.toHaveProperty("console");
  });
});
