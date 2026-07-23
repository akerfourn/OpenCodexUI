import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  isCodexCliVersionSupported,
  readCommandLinkTarget
} from "../src/backend/toolVersionDetection";

describe("toolVersionDetection", () => {
  it("should reject Codex CLI versions older than 0.144.1", () => {
    expect(isCodexCliVersionSupported("0.144.0")).toBe(false);
    expect(isCodexCliVersionSupported("0.144.1")).toBe(true);
    expect(isCodexCliVersionSupported("0.145.0")).toBe(true);
  });

  it.skipIf(process.platform === "win32")("should resolve a symbolic-link command target", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "opencodex-link-"));
    const target = path.join(directory, "codex-target");
    const link = path.join(directory, "codex");

    try {
      fs.writeFileSync(target, "codex");
      fs.symlinkSync(target, link);

      expect(readCommandLinkTarget(link)).toBe(target);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
