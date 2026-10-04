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
  ])("should build a PowerShell command for %s", (projectPath) => {
    const command = createShellCommand(" npm test ", projectPath);
    expect(command.slice(0, -1)).toEqual([
      "powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-OutputFormat", "Text", "-EncodedCommand"
    ]);
    expect(Buffer.from(command.at(-1)!, "base64").toString("utf16le")).toMatch(/^npm test\n/);
  });

  it("should transport multiline PowerShell with quotes, variables and Unicode without another shell parsing it", () => {
    const script = [
      "$message = 'L''été 🐈'",
      "$env:MODE = 'test'",
      "& 'C:\\Program Files\\nodejs\\node.exe' -e 'console.log(\"hello\")'",
      "Write-Output $message # trailing comment"
    ].join("\n");
    const command = createShellCommand(script, "C:\\workspace", "pwsh.exe");
    const decoded = Buffer.from(command.at(-1)!, "base64").toString("utf16le");
    expect(command[0]).toBe("pwsh.exe");
    expect(decoded.slice(0, script.length)).toBe(script);
    expect(decoded.slice(script.length)).toContain("\nif (-not $?)");
    expect(decoded).toContain("exit $LASTEXITCODE");
    expect(command).not.toContain("-ExecutionPolicy");
    expect(command).not.toContain("cmd.exe");
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
