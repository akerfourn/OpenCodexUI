import { describe, expect, it } from "vitest";

import {
  createExplorerFileOpenIntent,
  resolveInitialFileView
} from "../src/stores/files/fileOpenIntent";

describe("file open intent", () => {
  it("should open explorer and ordinary links in file mode", () => {
    expect(resolveInitialFileView({ origin: "explorer" })).toBe("file");
    expect(resolveInitialFileView({ origin: "link" })).toBe("file");
  });

  it("should open Git file rows in diff mode", () => {
    expect(resolveInitialFileView({
      origin: "git",
      gitDiff: { comparison: "workingTree", fileState: "modified" }
    })).toBe("diff");
  });

  it("should keep changed explorer files in file mode while carrying the diff context", () => {
    const intent = createExplorerFileOpenIntent({
      path: "src/file.ts",
      originalPath: null,
      status: "modified",
      stagedStatus: null,
      unstagedStatus: "modified"
    });

    expect(intent).toEqual({
      origin: "explorer",
      gitDiff: { comparison: "workingTree", fileState: "modified" }
    });
    expect(resolveInitialFileView(intent)).toBe("file");
  });

  it("should select staged comparison for files without working-tree changes", () => {
    expect(createExplorerFileOpenIntent({
      path: "src/file.ts",
      originalPath: null,
      status: "added",
      stagedStatus: "added",
      unstagedStatus: null
    })).toEqual({
      origin: "explorer",
      gitDiff: { comparison: "staged", fileState: "added" }
    });
  });
});
