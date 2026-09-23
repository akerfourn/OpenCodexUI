import { describe, expect, it } from "vitest";

import { resolveInitialFileView } from "../src/stores/files/fileOpenIntent";

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
});
