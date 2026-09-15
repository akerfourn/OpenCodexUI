import { describe, expect, it } from "vitest";

import {
  createShellCommand,
  isWindowsPath,
  readHostShellEnvironment,
  sanitizePathSegment
} from "../src/backend/projects/projectCommandExecution";

describe("project command execution helpers", () => {
  it("should build a POSIX shell command", () => {
    expect(createShellCommand("  npm test  ", "/workspace/project")).toEqual([
      "sh",
      "-lc",
      "npm test"
    ]);
  });

  it("should read only the host environment values allowed for local commands", () => {
    const environment = readHostShellEnvironment({
      PATH: "/home/adrien/.local/bin:/usr/bin",
      HOME: "/home/adrien",
      XDG_CONFIG_HOME: "/home/adrien/.config",
      CODEX_HOME: "/home/adrien/.codex",
      OPENCODEX_CODEX_COMMAND: "/home/adrien/.local/bin/codex",
      OPENAI_API_KEY: "must-not-be-forwarded"
    });

    expect(environment).toEqual({
      PATH: "/home/adrien/.local/bin:/usr/bin",
      HOME: "/home/adrien",
      XDG_CONFIG_HOME: "/home/adrien/.config",
      CODEX_HOME: "/home/adrien/.codex",
      OPENCODEX_CODEX_COMMAND: "/home/adrien/.local/bin/codex"
    });
    expect(environment).toHaveProperty(
      "OPENCODEX_CODEX_COMMAND",
      "/home/adrien/.local/bin/codex"
    );
    expect(environment).not.toHaveProperty("OPENAI_API_KEY");
  });

  it.each([
    "C:\\workspace\\project",
    "D:/workspace/project",
    "\\\\server\\share\\project"
  ])("should build a Windows shell command for %s", (projectPath) => {
    expect(createShellCommand(" npm test ", projectPath)).toEqual([
      "cmd.exe",
      "/d",
      "/s",
      "/c",
      "npm test"
    ]);
  });

  it("should reject an empty configured command", () => {
    expect(() => createShellCommand("   ", "/workspace/project")).toThrow("Command is required.");
  });

  it.each([
    ["C:\\workspace", true],
    ["c:/workspace", true],
    ["\\\\server\\share", true],
    ["/workspace", false],
    ["relative/path", false]
  ] as const)("should classify %s as Windows path: %s", (value, expected) => {
    expect(isWindowsPath(value)).toBe(expected);
  });

  it("should sanitize unsafe log path characters", () => {
    expect(sanitizePathSegment("project:one/two ")).toBe("project_one_two_");
    expect(sanitizePathSegment("safe-name_1.0")).toBe("safe-name_1.0");
  });
});
