import { describe, expect, it } from "vitest";

import {
  createShellCommand,
  isWindowsPath,
  sanitizePathSegment
} from "../src/backend/projectCommandExecution";

describe("project command execution helpers", () => {
  it("should build a POSIX shell command", () => {
    expect(createShellCommand("  npm test  ", "/workspace/project")).toEqual([
      "sh",
      "-lc",
      "npm test"
    ]);
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
