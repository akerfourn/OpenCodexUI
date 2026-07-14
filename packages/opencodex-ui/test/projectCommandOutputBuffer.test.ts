/**
 * Covers bounded buffering for streamed project-command output.
 */
import { describe, expect, it } from "vitest";

import { consumeProjectCommandOutput } from "../src/stores/projectCommandOutputBuffer";

describe("project command output buffer", () => {
  it("should retain an incomplete line for the next delta", () => {
    const result = consumeProjectCommandOutput("partial", " value", 20);

    expect(result.completedTexts).toEqual([]);
    expect(result.pendingText).toBe("partial value");
  });

  it("should combine pending output with completed lines", () => {
    const result = consumeProjectCommandOutput("partial", " value\nnext", 20);

    expect(result.completedTexts).toEqual(["partial value"]);
    expect(result.pendingText).toBe("next");
  });

  it("should split continuous output before the pending buffer can grow indefinitely", () => {
    const result = consumeProjectCommandOutput("", "abcdefghijkl", 5);

    expect(result.completedTexts).toEqual(["abcde", "fghij"]);
    expect(result.pendingText).toBe("kl");
  });

  it("should split a completed oversized logical line", () => {
    const result = consumeProjectCommandOutput("", "abcdefghijkl\n", 5);

    expect(result.completedTexts).toEqual(["abcde", "fghij", "kl"]);
    expect(result.pendingText).toBe("");
  });

  it("should normalize CRLF and carriage-return progress output", () => {
    const result = consumeProjectCommandOutput("", "one\r\ntwo\rthree", 20);

    expect(result.completedTexts).toEqual(["one", "two"]);
    expect(result.pendingText).toBe("three");
  });

  it("should keep UTF-16 surrogate pairs intact across chunks", () => {
    const result = consumeProjectCommandOutput("", "abcd🙂efghij", 5);

    expect(result.completedTexts).toEqual(["abcd", "🙂efg"]);
    expect(result.pendingText).toBe("hij");
  });

  it("should bound a deterministic large delta without newlines", () => {
    const result = consumeProjectCommandOutput("", "x".repeat(200_000));

    expect(result.completedTexts).toHaveLength(3);
    expect(result.completedTexts.every((text) => text.length <= 64 * 1024)).toBe(true);
    expect(result.pendingText.length).toBeLessThanOrEqual(64 * 1024);
    expect(
      result.completedTexts.reduce((total, text) => total + text.length, 0) +
      result.pendingText.length
    ).toBe(200_000);
  });
});
