import { describe, expect, it } from "vitest";
import { primaryMovePath } from "../src/backend/workspaces/primaryMovePaths";

describe("source-native primary move paths", () => {
  it.each([
    ["/repo/child", "/repo", "/new", "/new/child"],
    ["/repo-other/child", "/repo", "/new", "/repo-other/child"],
    ["C:\\Repo\\child", "c:\\repo", "D:\\New", "D:\\New\\child"],
    ["C:\\Repo-other", "C:\\Repo", "D:\\New", "C:\\Repo-other"],
    ["\\\\host\\share\\repo\\child", "\\\\host\\share\\repo", "\\\\host\\share\\new", "\\\\host\\share\\new\\child"]
  ])("should map only descendants in the owning filesystem: %s", (location, previous, destination, expected) => {
    expect(primaryMovePath(location, previous, destination)).toBe(expected);
  });
});
