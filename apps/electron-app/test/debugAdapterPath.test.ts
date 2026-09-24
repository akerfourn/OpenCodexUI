import { describe, test, expect } from "vitest";
import path from "node:path";
import { resolveDebugAdapterPath } from "../src/main/debugAdapterPath.js";

describe("bundled debugger resolution", () => {
  test("finds the build cache when Electron opens dist/main/main.cjs directly", () => {
    const root = path.resolve("app");
    const expected = path.join(root, "build/debug-adapter/1.140.0/js-debug/src/dapDebugServer.js");
    expect(resolveDebugAdapterPath(false, "unused", path.join(root, "dist/main"), root,
      candidate => candidate === expected)).toBe(expected);
  });
  test("uses extraResources independently of the launch directory when packaged", () => {
    const resources = path.resolve("resources");
    expect(resolveDebugAdapterPath(true, resources, "app.asar", "elsewhere")).toBe(
      path.join(resources, "debug-adapter/js-debug/src/dapDebugServer.js"));
  });
});
