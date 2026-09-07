import { describe, expect, it, vi } from "vitest";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type { OpenCodexWorkspaceCreateInput, OpenCodexWorkspaceCreation, OpenCodexWorkspaceRoot } from
  "@open-codex-ui/opencodex-protocol";
import { prepareWorkspaceStorage, resolveWorkspaceStorage } from "../src/backend/workspaces/WorkspaceStoragePaths";
import { normalizeWorkspaceRoots } from "../src/backend/workspaces/workspaceRootsSettings";

const root: OpenCodexWorkspaceRoot = { id: "root", sourceId: "source", label: "Projects", path: "/storage", isDefault: true };
const input: OpenCodexWorkspaceCreateInput = { projectId: "project", sourceId: "source",
  start: { mode: "detached", startPoint: "HEAD" } };
const creation = { projectId: "project", workspaceId: "workspace", rootPath: "/storage",
  destinationPath: "/storage/project/workspace" } as OpenCodexWorkspaceCreation;

/** Source filesystem double records only directory side effects and reports explicit missing paths. */
function filesystem() {
  const directories = new Set(["/", "/storage"]);
  const getMetadata = vi.fn(async (path: string) => {
    if (!directories.has(path)) throw new Error("File not found");
    return { isDirectory: true, isSymlink: false };
  });
  const createDirectory = vi.fn(async (path: string) => { directories.add(path); return {}; });
  const client = { getMetadata, createDirectory } as unknown as Pick<CodexAppServerClient, "getMetadata" | "createDirectory">;
  return { directories, getMetadata, createDirectory, client };
}

describe("workspace storage destinations", () => {
  it("should use the source default and the real immutable workspace ID", () => {
    expect(resolveWorkspaceStorage(input, "workspace", [root])).toEqual({
      rootPath: "/storage", destinationPath: "/storage/project/workspace"
    });
    const windowsRoot = { ...root, path: "D:\\workspaces" };
    expect(resolveWorkspaceStorage(input, "workspace", [windowsRoot]).destinationPath)
      .toBe("D:\\workspaces\\project\\workspace");
  });

  it("should support alternate roots and preserve explicit custom destinations", () => {
    const alternate = { ...root, id: "alternate", path: "/other", isDefault: false };
    expect(resolveWorkspaceStorage({ ...input, rootId: "alternate" }, "workspace", [root, alternate]).rootPath).toBe("/other");
    expect(resolveWorkspaceStorage({ ...input, destinationPath: "/custom" }, "workspace", [])).toEqual({
      rootPath: null, destinationPath: "/custom"
    });
  });

  it("should reject cross-source roots, ambiguous choices and path traversal identifiers", () => {
    expect(() => resolveWorkspaceStorage({ ...input, sourceId: "wsl", rootId: "root" }, "workspace", [root]))
      .toThrow("for this source");
    expect(() => resolveWorkspaceStorage({ ...input, rootId: "root", destinationPath: "/custom" }, "workspace", [root]))
      .toThrow("either");
    expect(() => resolveWorkspaceStorage({ ...input, projectId: "../escape" }, "workspace", [root])).toThrow("path-safe");
  });

  it("should require unique roots and exactly one default for each configured source", () => {
    expect(normalizeWorkspaceRoots([{ ...root, label: "  Projects  " }])[0].label).toBe("Projects");
    expect(() => normalizeWorkspaceRoots([{ ...root, isDefault: false }])).toThrow("exactly one default");
    expect(() => normalizeWorkspaceRoots([root, root])).toThrow("unique identities");
    expect(() => normalizeWorkspaceRoots([{ ...root, path: "relative" }])).toThrow("absolute path");
    expect(normalizeWorkspaceRoots([root, { ...root, id: "wsl", sourceId: "wsl" }])).toHaveLength(2);
  });

  it("should create only the project parent and leave the workspace directory for Git", async () => {
    const { client, createDirectory, directories } = filesystem();
    await prepareWorkspaceStorage(client, creation);
    expect(createDirectory.mock.calls).toEqual([["/storage/project"]]);
    expect(directories.has(creation.destinationPath)).toBe(false);
    await prepareWorkspaceStorage(client, creation);
    expect(createDirectory).toHaveBeenCalledTimes(1);
  });

  it("should refuse missing roots and symlink ancestors without creating any directories", async () => {
    const { client, createDirectory, directories, getMetadata } = filesystem();
    directories.delete("/storage");
    await expect(prepareWorkspaceStorage(client, creation)).rejects.toThrow("File not found");
    getMetadata.mockResolvedValue({ isDirectory: true, isSymlink: true });
    await expect(prepareWorkspaceStorage(client, creation)).rejects.toThrow("symbolic links");
    expect(createDirectory).not.toHaveBeenCalled();
  });

  it("should refuse a substituted hierarchy or a mismatch with the reserved destination", async () => {
    const { client, getMetadata, createDirectory } = filesystem();
    getMetadata.mockImplementation(async (path) => ({ isDirectory: true, isSymlink: path === "/storage/project" }));
    await expect(prepareWorkspaceStorage(client, creation)).rejects.toThrow("symbolic link");
    await expect(prepareWorkspaceStorage(client, { ...creation, destinationPath: "/elsewhere" })).rejects.toThrow("reserved identity");
    expect(createDirectory).not.toHaveBeenCalled();
  });
});
