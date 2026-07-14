/**
 * Covers path matching for the project Git deferred-file workflow.
 */
import { describe, expect, it } from "vitest";

import {
  findDeferredPath,
  isPathDeferred,
  mergeDeferredPaths,
  normalizeDeferredPath,
  removeDeferredPath
} from "../src/stores/gitDeferredPaths";

describe("Git deferred paths", () => {
  it("should match a deferred directory without matching a similarly named sibling", () => {
    expect(isPathDeferred("src/components/Button.tsx", ["src"])).toBe(true);
    expect(isPathDeferred("src-old/Button.tsx", ["src"])).toBe(false);
  });

  it("should collapse deferred files covered by a deferred directory", () => {
    expect(mergeDeferredPaths(["src/Button.tsx"], ["src", "notes/design.md"])).toEqual([
      "notes/design.md",
      "src"
    ]);
  });

  it("should normalize safe paths and reject paths outside the project", () => {
    expect(normalizeDeferredPath("./src\\Button.tsx/")).toBe("src/Button.tsx");
    expect(normalizeDeferredPath("../secrets.txt")).toBeNull();
    expect(normalizeDeferredPath("/tmp/secrets.txt")).toBeNull();
  });

  it("should return and remove the deferred directory covering a file", () => {
    const deferredPaths = ["src", "src/components/Button.tsx"];

    expect(findDeferredPath("src/components/Input.tsx", deferredPaths)).toBe("src");
    expect(removeDeferredPath(deferredPaths, "src")).toEqual(["src/components/Button.tsx"]);
  });
});
