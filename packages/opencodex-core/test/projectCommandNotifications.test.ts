import { describe, expect, it } from "vitest";

import {
  decodeBase64Output,
  prefixLines,
  readExitedStatus,
  readProcessExited,
  readProcessOutputDelta
} from "../src/backend/projects/projectCommandNotifications";

describe("project command notifications", () => {
  it("should normalize a process output delta", () => {
    expect(readProcessOutputDelta({
      processHandle: "process-1",
      stream: "stderr",
      deltaBase64: "ZmFpbGVk",
      capReached: 1
    })).toEqual({
      processHandle: "process-1",
      stream: "stderr",
      deltaBase64: "ZmFpbGVk",
      capReached: false
    });
  });

  it.each([
    null,
    [],
    {},
    { processHandle: 1, stream: "stdout", deltaBase64: "" },
    { processHandle: "process-1", stream: "other", deltaBase64: "" },
    { processHandle: "process-1", stream: "stdout", deltaBase64: 1 }
  ])("should reject an invalid process output delta", (value) => {
    expect(readProcessOutputDelta(value)).toBeNull();
  });

  it("should normalize a process exit with safe output defaults", () => {
    expect(readProcessExited({
      processHandle: "process-1",
      exitCode: 2,
      stdout: 1,
      stdoutCapReached: true,
      stderr: "failed",
      stderrCapReached: false
    })).toEqual({
      processHandle: "process-1",
      exitCode: 2,
      stdout: "",
      stdoutCapReached: true,
      stderr: "failed",
      stderrCapReached: false
    });
  });

  it.each([
    null,
    [],
    {},
    { processHandle: 1, exitCode: 0 },
    { processHandle: "process-1", exitCode: "0" }
  ])("should reject an invalid process exit", (value) => {
    expect(readProcessExited(value)).toBeNull();
  });

  it("should decode UTF-8 process output", () => {
    const encoded = Buffer.from("Terminé ✓", "utf8").toString("base64");

    expect(decodeBase64Output(encoded)).toBe("Terminé ✓");
  });

  it.each([
    [0, "exited"],
    [1, "failed"],
    [-1, "failed"]
  ] as const)("should map exit code %s to %s", (exitCode, status) => {
    expect(readExitedStatus(exitCode)).toBe(status);
  });

  it("should preserve output when no prefix is requested", () => {
    expect(prefixLines("first\nsecond", "")).toBe("first\nsecond");
  });

  it("should prefix every non-empty output line while preserving separators", () => {
    expect(prefixLines("first\r\n\r\nsecond\n", "[stderr] ")).toBe(
      "[stderr] first\r\n\r\n[stderr] second\n"
    );
  });
});
