import { describe, expect, it } from "vitest";

import { readRendererActivityState } from "../src/main/rendererActivityPayload.js";

describe("renderer activity payload", () => {
  it("should accept the content-free project activity state", () => {
    expect(readRendererActivityState({ hasPendingProjectActivity: true })).toEqual({
      hasPendingProjectActivity: true
    });
  });

  it("should reject malformed renderer activity state", () => {
    expect(readRendererActivityState(null)).toBeNull();
    expect(readRendererActivityState({ hasPendingProjectActivity: "true" })).toBeNull();
    expect(readRendererActivityState([])).toBeNull();
  });
});
