/**
 * Covers Git porcelain v2 parsing.
 */
import { describe, expect, it } from "vitest";

import { parseGitStatus } from "../src/backend/gitStatusParser";

describe("parseGitStatus", () => {
  it("should split staged and unstaged files from porcelain v2 output", () => {
    const output = [
      "# branch.head main",
      "1 M. N... 100644 100644 100644 abc abc staged.ts",
      "1 .M N... 100644 100644 100644 abc abc changed.ts",
      "? new-file.ts",
      ""
    ].join("\0");

    expect(parseGitStatus(output)).toEqual({
      isRepository: true,
      branchName: "main",
      changedFiles: [
        {
          path: "changed.ts",
          originalPath: null,
          status: "modified",
          stagedStatus: null,
          unstagedStatus: "modified"
        },
        {
          path: "new-file.ts",
          originalPath: null,
          status: "untracked",
          stagedStatus: null,
          unstagedStatus: "untracked"
        }
      ],
      stagedFiles: [
        {
          path: "staged.ts",
          originalPath: null,
          status: "modified",
          stagedStatus: "modified",
          unstagedStatus: null
        }
      ]
    });
  });

  it("should preserve renamed file paths", () => {
    const output = [
      "# branch.head feature/git-panel",
      "2 R. N... 100644 100644 100644 abc def R100 new name.ts",
      "old name.ts",
      ""
    ].join("\0");

    expect(parseGitStatus(output).stagedFiles).toEqual([
      {
        path: "new name.ts",
        originalPath: "old name.ts",
        status: "renamed",
        stagedStatus: "renamed",
        unstagedStatus: null
      }
    ]);
  });
});
