/**
 * Covers terminal output normalization helpers.
 */
import { describe, expect, it } from "vitest";

import { sanitizeTerminalOutput } from "../src/backend/terminalOutput";

describe("terminal output normalization", () => {
  it("should remove ANSI cursor and clear-line sequences", () => {
    expect(sanitizeTerminalOutput("\u001B[1G\u001B[0KSearching dependency tree")).toBe(
      "Searching dependency tree"
    );
  });

  it("should remove OSC terminal sequences", () => {
    expect(sanitizeTerminalOutput("\u001B]0;title\u0007npm run dev")).toBe("npm run dev");
  });

  it("should preserve tabs and new lines", () => {
    expect(sanitizeTerminalOutput("a\tb\nc")).toBe("a\tb\nc");
  });
});
