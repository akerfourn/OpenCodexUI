import { describe, expect, it } from "vitest";
import { isWorkspaceProjectTrusted } from "../src/backend/workspaces/workspaceProjectTrust";

describe("workspace project trust paths", () => {
  it.each([
    ["d:\\projets\\perso\\opencodexui", "D:\\Projets\\Perso\\OpenCodexUI"],
    ["d:/projets/perso/opencodexui", "D:\\Projets\\Perso\\OpenCodexUI"],
    ["D:\\Projets\\Perso\\OpenCodexUI\\", "d:/projets/perso/opencodexui"],
    ["\\\\server\\share\\repo", "\\\\SERVER\\SHARE\\Repo"],
    ["/home/user/repo", "/home/user/repo"]
  ])("should recognize the trusted directory %s when the workspace uses %s", (configuredPath, projectPath) => {
    expect(isWorkspaceProjectTrusted({ [configuredPath]: { trust_level: "trusted" } }, projectPath)).toBe(true);
  });

  it.each([
    ["/home/user/repo", "/home/user/Repo"],
    ["/home/user/repo", "/home/user/repo/child"],
    ["D:\\projects\\repo", "D:\\projects\\repo-other"],
    ["D:\\projects\\repo", "E:\\projects\\repo"],
    ["D:\\projects", "D:\\projects\\repo"],
    ["/mnt/d/projects/repo", "D:\\projects\\repo"]
  ])("should refuse unrelated or differently cased POSIX paths: %s and %s", (configuredPath, projectPath) => {
    expect(isWorkspaceProjectTrusted({ [configuredPath]: { trust_level: "trusted" } }, projectPath)).toBe(false);
  });

  it.each(["untrusted", "unknown", null, undefined])("should preserve a refusal or missing trust level: %s", level => {
    expect(isWorkspaceProjectTrusted({ "d:/projects/repo": { trust_level: level } }, "D:\\Projects\\Repo")).toBe(false);
  });

  it("should reject conflicting Windows aliases regardless of insertion order", () => {
    const entries = [["D:\\Projects\\Repo", { trust_level: "trusted" }], ["d:/projects/repo", { trust_level: "untrusted" }]];
    expect(isWorkspaceProjectTrusted(Object.fromEntries(entries), "D:\\Projects\\Repo")).toBe(false);
    expect(isWorkspaceProjectTrusted(Object.fromEntries(entries.reverse()), "D:\\Projects\\Repo")).toBe(false);
  });

  it("should ignore malformed configuration keys and fail closed for missing project maps", () => {
    expect(isWorkspaceProjectTrusted({ relative: { trust_level: "trusted" },
      "d:/projects/repo": { trust_level: "trusted" } }, "D:\\Projects\\Repo")).toBe(true);
    expect(isWorkspaceProjectTrusted(undefined, "D:\\Projects\\Repo")).toBe(false);
    expect(isWorkspaceProjectTrusted(null, "D:\\Projects\\Repo")).toBe(false);
    expect(isWorkspaceProjectTrusted({ relative: { trust_level: "trusted" } }, "relative")).toBe(false);
  });
});
