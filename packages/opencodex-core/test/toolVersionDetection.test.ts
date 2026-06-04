import { describe, expect, it } from "vitest";

import { isCodexCliVersionSupported } from "../src/backend/toolVersionDetection";

describe("toolVersionDetection", () => {
  it("should reject Codex CLI versions older than 0.137.0", () => {
    expect(isCodexCliVersionSupported("0.136.9")).toBe(false);
    expect(isCodexCliVersionSupported("0.137.0")).toBe(true);
    expect(isCodexCliVersionSupported("0.138.0")).toBe(true);
  });
});
