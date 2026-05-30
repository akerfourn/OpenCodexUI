import type { OpenCodexFileSearchResult } from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it } from "vitest";

import {
  filterSearchableProjectFiles,
  isSearchableProjectFilePath
} from "../src/backend/fileSearchFilters";

describe("file search filters", () => {
  it("should reject files inside VCS implementation directories", () => {
    expect(isSearchableProjectFilePath(".git/config")).toBe(false);
    expect(isSearchableProjectFilePath("src/.git/config")).toBe(false);
    expect(isSearchableProjectFilePath("src\\.svn\\entries")).toBe(false);
  });

  it("should keep regular hidden and source files", () => {
    expect(isSearchableProjectFilePath(".github/workflows/ci.yml")).toBe(true);
    expect(isSearchableProjectFilePath("src/components/App.tsx")).toBe(true);
  });

  it("should filter file search results before they reach the UI", () => {
    const files = [
      createFile("src/App.tsx"),
      createFile(".git/objects/00/hash"),
      createFile("src/.hg/store/file")
    ];

    expect(filterSearchableProjectFiles(files)).toEqual([createFile("src/App.tsx")]);
  });
});

function createFile(path: string): OpenCodexFileSearchResult {
  return {
    root: "/workspace/project",
    path: `/workspace/project/${path}`,
    relativePath: path,
    fileName: path.split("/").at(-1) ?? path,
    matchType: "file"
  };
}
