import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveCommitPromptPath } from "../src/main/commitPromptPaths.js";

describe("commit prompt paths", () => {
  const fileName = "prompt-commit.default.md";
  let directory: string;
  let resourcesPath: string;
  let workingDirectory: string;
  let packagedPromptPath: string;
  let repositoryPromptPath: string;
  let launchPromptPath: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "opencodexui-prompts-"));
    resourcesPath = path.join(directory, "resources");
    workingDirectory = path.join(directory, "apps", "electron-app");
    fs.mkdirSync(resourcesPath);
    fs.mkdirSync(workingDirectory, { recursive: true });
    packagedPromptPath = path.join(resourcesPath, fileName);
    repositoryPromptPath = path.join(directory, fileName);
    launchPromptPath = path.join(workingDirectory, fileName);
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("should prefer packaged resources when development copies also exist", () => {
    fs.writeFileSync(packagedPromptPath, "packaged");
    fs.writeFileSync(repositoryPromptPath, "repository");
    fs.writeFileSync(launchPromptPath, "launch");

    expect(resolveCommitPromptPath(fileName, resourcesPath, workingDirectory)).toBe(packagedPromptPath);
  });

  it("should prefer the repository copy when packaged resources are missing", () => {
    fs.writeFileSync(repositoryPromptPath, "repository");
    fs.writeFileSync(launchPromptPath, "launch");

    expect(resolveCommitPromptPath(fileName, resourcesPath, workingDirectory)).toBe(repositoryPromptPath);
  });

  it("should use the launch directory when neither earlier candidate exists", () => {
    fs.writeFileSync(launchPromptPath, "launch");

    expect(resolveCommitPromptPath(fileName, resourcesPath, workingDirectory)).toBe(launchPromptPath);
  });

  it("should support a process without an Electron resources path", () => {
    fs.writeFileSync(repositoryPromptPath, "repository");

    expect(resolveCommitPromptPath(fileName, undefined, workingDirectory)).toBe(repositoryPromptPath);
  });

  it("should preserve the repository fallback when no candidate exists", () => {
    expect(resolveCommitPromptPath(fileName, resourcesPath, workingDirectory)).toBe(repositoryPromptPath);
    expect(resolveCommitPromptPath(fileName, undefined, workingDirectory)).toBe(repositoryPromptPath);
  });
});
