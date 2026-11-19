import { describe, expect, it } from "vitest";
import { parseWorkspaceRemovalFiles } from "../src/backend/workspaces/workspaceRemovalFiles";

describe("workspace removal file inventory", () => {
  it("should preserve literal paths, classify ignored contents and consume rename origins", () => {
    expect(parseWorkspaceRemovalFiles(" M tracked.txt\0??  spaced\nfile.txt\0!! cache/\0R  new.txt\0old.txt\0"))
      .toEqual([{ path: "tracked.txt", kind: "tracked" }, { path: " spaced\nfile.txt", kind: "untracked" },
        { path: "cache/", kind: "ignored" }, { path: "new.txt", kind: "tracked" }]);
  });
  it("should reject truncated or unsupported inventories instead of authorizing force", () => {
    expect(() => parseWorkspaceRemovalFiles("?? partial")).toThrow("Incomplete");
    expect(() => parseWorkspaceRemovalFiles("R  new.txt\0")).toThrow("rename");
    expect(() => parseWorkspaceRemovalFiles("invalid\0")).toThrow("Unsupported");
    expect(parseWorkspaceRemovalFiles("")).toEqual([]);
  });
});
