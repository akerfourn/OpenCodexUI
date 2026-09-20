import { describe, expect, it } from "vitest";
import { commandExecutionConflicts } from "@open-codex-ui/opencodex-protocol";

const target = { commandId: "build", sourceId: "local", workspaceId: "primary", cwd: "/repo" };

describe("command execution limits", () => {
  it("should apply a project limit per command, across physical locations", () => {
    expect(commandExecutionConflicts("project", target, { ...target, cwd: "/other", workspaceId: "other" })).toBe(true);
    expect(commandExecutionConflicts("project", target, { ...target, commandId: "tests" })).toBe(false);
  });
  it("should recognize workspace identity and legacy directory context", () => {
    expect(commandExecutionConflicts("workspace", target, { ...target, cwd: "/moved" })).toBe(true);
    expect(commandExecutionConflicts("workspace", target, { ...target, workspaceId: undefined })).toBe(true);
    expect(commandExecutionConflicts("workspace", target, { ...target, workspaceId: "other", cwd: "/other" })).toBe(false);
    expect(commandExecutionConflicts("workspace", target, { ...target, sourceId: "remote" })).toBe(false);
  });
  it("should conservatively block legacy runs without physical context", () => {
    expect(commandExecutionConflicts("workspace", target, { commandId: "build" })).toBe(true);
  });
  it("should never limit parallel executions", () => {
    expect(commandExecutionConflicts("parallel", target, target)).toBe(false);
  });
});
