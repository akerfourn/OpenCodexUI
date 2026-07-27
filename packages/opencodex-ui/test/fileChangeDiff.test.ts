import { describe, expect, it } from "vitest";

import { parseFileChangeDiff } from "../src/components/messages/fileChangeDiff";

describe("file change diff parsing", () => {
  it("should parse structured historical file changes", () => {
    const parsed = parseFileChangeDiff(JSON.stringify({
      type: "fileChange",
      changes: [{
        path: "src/example.ts",
        kind: "update",
        diff: "@@ -1 +1 @@\n-old\n+new\n"
      }]
    }));

    expect(parsed?.changes).toEqual([{
      path: "src/example.ts",
      kind: "update",
      diff: "@@ -1 +1 @@\n-old\n+new\n"
    }]);
  });

  it("should parse an aggregated unified diff as one visual entry", () => {
    const diff = "diff --git a/example.ts b/example.ts\n@@ -1 +1 @@\n-old\n+new";

    expect(parseFileChangeDiff(diff)?.changes).toEqual([{
      path: null,
      kind: "update",
      diff
    }]);
  });

  it("should return no visual data for unsupported raw details", () => {
    expect(parseFileChangeDiff("{\"status\":\"completed\"}")).toBeNull();
  });
});
