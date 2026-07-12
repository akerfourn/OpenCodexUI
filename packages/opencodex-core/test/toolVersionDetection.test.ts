import { describe, expect, it } from "vitest";

import { isCodexCliVersionSupported } from "../src/backend/toolVersionDetection";

describe("toolVersionDetection", () => {
  it("should reject Codex CLI versions older than 0.144.1", () => {
    expect(isCodexCliVersionSupported("0.144.0")).toBe(false);
    expect(isCodexCliVersionSupported("0.144.1")).toBe(true);
    expect(isCodexCliVersionSupported("0.145.0")).toBe(true);
  });
});
