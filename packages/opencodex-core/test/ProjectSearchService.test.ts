import type { CodexAppServerClient, v2 } from "@open-codex-ui/codex-rpc";
import type { OpenCodexFileSearchResult } from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it, vi } from "vitest";

import { ProjectSearchService } from "../src/backend/ProjectSearchService";

describe("ProjectSearchService", () => {
  it("should return no results without resolving a client for an invalid root", async () => {
    const ensureClient = vi.fn();
    const service = new ProjectSearchService({ ensureClient });

    await expect(service.searchProjectFiles("  ", null, "", 10)).resolves.toEqual([]);
    await expect(service.searchProjectSkills("", null, "", 10)).resolves.toEqual([]);
    expect(ensureClient).not.toHaveBeenCalled();
  });

  it("should map, filter, order, and limit root directory results", async () => {
    const request = vi.fn(async () => ({
      entries: [
        { fileName: "README.md", isFile: true, isDirectory: false },
        { fileName: "src", isFile: false, isDirectory: true },
        { fileName: "assets", isFile: false, isDirectory: true },
        { fileName: ".git", isFile: false, isDirectory: true },
        { fileName: "invalid", isFile: false, isDirectory: false }
      ]
    }));
    const client = createClient(request);
    const ensureClient = vi.fn(async () => client);
    const service = new ProjectSearchService({ ensureClient });

    const results = await service.searchProjectFiles(
      "/workspace/project",
      "local",
      "   ",
      3
    );

    expect(request).toHaveBeenCalledWith("fs/readDirectory", {
      path: "/workspace/project"
    });
    expect(ensureClient).toHaveBeenCalledWith("local");
    expect(results).toEqual([
      createFile("assets", "directory"),
      createFile("src", "directory"),
      createFile("README.md", "file")
    ]);
  });

  it("should clamp a non-positive file limit to one result", async () => {
    const request = vi.fn(async () => ({
      entries: [
        { fileName: "README.md", isFile: true, isDirectory: false },
        { fileName: "src", isFile: false, isDirectory: true }
      ]
    }));
    const client = createClient(request);
    const ensureClient = vi.fn(async () => client);
    const service = new ProjectSearchService({ ensureClient });

    const results = await service.searchProjectFiles(
      "/workspace/project",
      "local",
      "",
      -1
    );

    expect(results).toEqual([createFile("src", "directory")]);
  });

  it("should join Windows fallback paths after normalizing mixed separators", async () => {
    const request = vi.fn(async () => ({
      entries: [{ fileName: "src", isFile: false, isDirectory: true }]
    }));
    const client = createClient(request);
    const ensureClient = vi.fn(async () => client);
    const service = new ProjectSearchService({ ensureClient });

    const results = await service.searchProjectFiles(
      "C:/workspace/project",
      "windows",
      " ",
      10
    );

    expect(request).toHaveBeenCalledWith("fs/readDirectory", {
      path: "C:\\workspace\\project"
    });
    expect(ensureClient).toHaveBeenCalledWith("windows");
    expect(results).toEqual([{
      root: "C:\\workspace\\project",
      path: "C:\\workspace\\project\\src",
      relativePath: "src",
      fileName: "src",
      matchType: "directory"
    }]);
  });

  it("should map fuzzy files, preserve Windows paths, and filter directories", async () => {
    const request = vi.fn(async () => ({
      files: [
        {
          root: "C:\\workspace\\project",
          path: "C:\\workspace\\project/src/App.tsx",
          file_name: "App.tsx",
          match_type: "file"
        },
        {
          root: "C:\\workspace\\project",
          path: "C:\\workspace\\project\\src",
          file_name: "src",
          match_type: "directory"
        },
        {
          root: "C:\\workspace\\project",
          path: "C:\\workspace\\project\\.svn\\entries",
          file_name: "entries",
          match_type: "file"
        }
      ]
    }));
    const client = createClient(request);
    const ensureClient = vi.fn(async () => client);
    const service = new ProjectSearchService({
      ensureClient
    });

    const results = await service.searchProjectFiles(
      "C:\\workspace\\project",
      "windows",
      "app",
      10
    );

    expect(request).toHaveBeenCalledWith("fuzzyFileSearch", {
      query: "app",
      roots: ["C:\\workspace\\project"],
      cancellationToken: null
    });
    expect(results).toEqual([
      {
        root: "C:\\workspace\\project",
        path: "C:\\workspace\\project/src/App.tsx",
        relativePath: "src/App.tsx",
        fileName: "App.tsx",
        matchType: "file"
      }
    ]);
    expect(ensureClient).toHaveBeenCalledWith("windows");
  });

  it("should exclude disabled skills and order enabled fuzzy matches by score", async () => {
    const request = vi.fn(async () => ({
      data: [{
        cwd: "/workspace/project",
        errors: [],
        skills: [
          createSkill("build"),
          createSkill("build-zeta"),
          createSkill("build-alpha"),
          createSkill("my-build"),
          createSkill("bxxuxixlxd"),
          createSkill("build-disabled", false),
          createSkill("deploy")
        ]
      }]
    }));
    const client = createClient(request);
    const ensureClient = vi.fn(async () => client);
    const service = new ProjectSearchService({
      ensureClient
    });

    const results = await service.searchProjectSkills(
      "/workspace/project",
      "skills-source",
      "build",
      10
    );

    expect(request).toHaveBeenCalledWith("skills/list", {
      cwds: ["/workspace/project"],
      forceReload: false
    });
    expect(results.map((skill) => skill.name)).toEqual([
      "build",
      "build-alpha",
      "build-zeta",
      "my-build",
      "bxxuxixlxd"
    ]);
    expect(results.some((skill) => skill.name === "build-disabled")).toBe(false);
    expect(ensureClient).toHaveBeenCalledWith("skills-source");
  });

  it("should return enabled skills for an empty query and map metadata fallbacks", async () => {
    const request = vi.fn(async () => ({
      data: [{
        cwd: "/workspace/project",
        errors: [],
        skills: [
          createSkill("zeta", true, { shortDescription: "Legacy short" }),
          createSkill("friendly", true, {
            displayName: "Readable Tool",
            interfaceShortDescription: "Friendly short"
          }),
          createSkill("alpha"),
          createSkill("disabled", false)
        ]
      }]
    }));
    const client = createClient(request);
    const ensureClient = vi.fn(async () => client);
    const service = new ProjectSearchService({ ensureClient });

    const results = await service.searchProjectSkills(
      "/workspace/project",
      "skills-source",
      "  ",
      10
    );

    expect(request).toHaveBeenCalledWith("skills/list", {
      cwds: ["/workspace/project"],
      forceReload: false
    });
    expect(results).toEqual([
      {
        name: "alpha",
        displayName: "alpha",
        description: "alpha description",
        shortDescription: null,
        path: "/workspace/project/.codex/skills/alpha",
        scope: "repo"
      },
      {
        name: "friendly",
        displayName: "Readable Tool",
        description: "friendly description",
        shortDescription: "Friendly short",
        path: "/workspace/project/.codex/skills/friendly",
        scope: "repo"
      },
      {
        name: "zeta",
        displayName: "zeta",
        description: "zeta description",
        shortDescription: "Legacy short",
        path: "/workspace/project/.codex/skills/zeta",
        scope: "repo"
      }
    ]);
    expect(ensureClient).toHaveBeenCalledWith("skills-source");
  });

  it("should match a skill through its display name", async () => {
    const request = vi.fn(async () => ({
      data: [{
        cwd: "/workspace/project",
        errors: [],
        skills: [
          createSkill("technical-name", true, { displayName: "Readable Tool" }),
          createSkill("unrelated")
        ]
      }]
    }));
    const client = createClient(request);
    const service = new ProjectSearchService({
      ensureClient: vi.fn(async () => client)
    });

    const results = await service.searchProjectSkills(
      "/workspace/project",
      "skills-source",
      "readable",
      10
    );

    expect(results.map((skill) => skill.name)).toEqual(["technical-name"]);
  });
});

/** Creates a structural Codex client double for one request handler. */
function createClient(request: (method: string, params?: unknown) => Promise<unknown>) {
  return { request } as unknown as CodexAppServerClient;
}

/** Creates a file result expected from the root-directory fallback search. */
function createFile(
  fileName: string,
  matchType: OpenCodexFileSearchResult["matchType"]
): OpenCodexFileSearchResult {
  return {
    root: "/workspace/project",
    path: `/workspace/project/${fileName}`,
    relativePath: fileName,
    fileName,
    matchType
  };
}

/** Creates a minimal skill metadata entry for the skills search response. */
type SkillOptions = {
  displayName?: string;
  interfaceShortDescription?: string;
  shortDescription?: string;
};

/** Creates a minimal skill metadata entry with optional UI metadata. */
function createSkill(
  name: string,
  enabled = true,
  options: SkillOptions = {}
): v2.SkillMetadata {
  const skill: v2.SkillMetadata = {
    name,
    description: `${name} description`,
    path: `/workspace/project/.codex/skills/${name}`,
    scope: "repo",
    enabled
  };

  if (options.shortDescription !== undefined) {
    skill.shortDescription = options.shortDescription;
  }

  if (options.displayName !== undefined || options.interfaceShortDescription !== undefined) {
    skill.interface = {
      displayName: options.displayName,
      shortDescription: options.interfaceShortDescription,
      iconSmallUrl: null,
      iconLargeUrl: null
    };
  }

  return skill;
}
