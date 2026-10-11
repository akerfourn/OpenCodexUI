import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ensureProjectDirectory } from "../src/main/projectDirectory.js";

describe("host project directory", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "opencodexui-project-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it("should normalize whitespace and relative segments for an existing directory", async () => {
    const input = `  ${directory}${path.sep}..${path.sep}${path.basename(directory)}  `;

    expect(await ensureProjectDirectory(input, false)).toBe(path.resolve(directory));
  });

  it("should reject an empty project path", async () => {
    await expect(ensureProjectDirectory("  ", true)).rejects.toThrow("Project path is required.");
  });

  it("should recursively create a missing project directory when requested", async () => {
    const projectPath = path.join(directory, "parent", "project");

    expect(await ensureProjectDirectory(projectPath, true)).toBe(projectPath);
    expect((await fs.stat(projectPath)).isDirectory()).toBe(true);
  });

  it("should leave a missing project directory absent when creation is disabled", async () => {
    const projectPath = path.join(directory, "missing");

    await expect(ensureProjectDirectory(projectPath, false)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(projectPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("should reject a regular file even when directory creation is enabled", async () => {
    const projectPath = path.join(directory, "file");
    await fs.writeFile(projectPath, "preserved contents");

    await expect(ensureProjectDirectory(projectPath, true))
      .rejects.toThrow(`Project path is not a directory: ${projectPath}`);
    expect(await fs.readFile(projectPath, "utf8")).toBe("preserved contents");
  });

  it("should propagate access errors without attempting directory creation", async () => {
    const error = Object.assign(new Error("Permission denied"), { code: "EACCES" });
    vi.spyOn(fs, "stat").mockRejectedValue(error);
    const mkdir = vi.spyOn(fs, "mkdir");

    await expect(ensureProjectDirectory(directory, true)).rejects.toBe(error);
    expect(mkdir).not.toHaveBeenCalled();
  });
});
