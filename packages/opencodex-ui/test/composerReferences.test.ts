import { describe, expect, it } from "vitest";

import { parseFileSearchQuery } from "../src/components/chat/composerReferences";

describe("composer file search queries", () => {
  it("should keep regular file triggers on the indexed search", () => {
    expect(parseFileSearchQuery("  src/app  ")).toEqual({
      query: "src/app",
      searchMode: "indexed"
    });
  });

  it("should remove the extended marker before filesystem search", () => {
    expect(parseFileSearchQuery("  ! .goals/progress.md  ")).toEqual({
      query: ".goals/progress.md",
      searchMode: "filesystem"
    });
  });
});
