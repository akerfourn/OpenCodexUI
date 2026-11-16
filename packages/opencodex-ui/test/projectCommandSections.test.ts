import { describe, expect, it } from "vitest";
import type { OpenCodexProjectCommand } from "@open-codex-ui/opencodex-protocol";
import { commandSections, sameCommandSection } from "../src/stores/project/projectCommandDefinitions";

/** Keeps presentation fixtures independent of process execution. */
function command(id: string, groupName: string | null = null, isFavorite = false): OpenCodexProjectCommand {
  return { id, projectId: "project", name: id, command: "echo test", executionMode: "project",
    persistLogs: false, sortOrder: 0, createdAt: "", updatedAt: "", groupName, isFavorite };
}

describe("command organization", () => {
  it("should retain grouped favorites in both sections while preserving command order", () => {
    const build = command("build", "Build");
    const favorite = command("favorite", "Build", true);
    const plain = command("plain");
    const test = command("test", "Tests");
    expect(commandSections([build, plain, favorite, test])).toEqual({ favorites: [favorite],
      ungrouped: [plain], groups: [{ name: "Build", commands: [build, favorite] }, { name: "Tests", commands: [test] }] });
    expect(commandSections([{ ...favorite, isFavorite: false }]).groups[0]?.commands[0]?.groupName).toBe("Build");
  });

  it("should show ungrouped favorites only in favorites and retain empty named groups", () => {
    const favorite = command("favorite", null, true);
    const plain = command("plain");
    expect(commandSections([favorite, plain], ["Build"])).toEqual({
      favorites: [favorite], ungrouped: [plain], groups: [{ name: "Build", commands: [] }]
    });
    expect(commandSections([{ ...favorite, isFavorite: false }, plain]).ungrouped).toEqual([
      { ...favorite, isFavorite: false }, plain
    ]);
  });

  it("should keep ordering controls inside the visible section", () => {
    expect(sameCommandSection(command("a", "Build", true), command("b", "Tests", true))).toBe(true);
    expect(sameCommandSection(command("a", "Build"), command("b", "Tests"))).toBe(false);
    expect(sameCommandSection(command("a", "Build", true), command("b", "Build"))).toBe(false);
  });
});
