import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import { describe, expect, it, vi } from "vitest";

import {
  ProjectContextService,
  buildManagedConfigBlock,
  replaceManagedBlock
} from "../src/backend/projects/ProjectContextService";

describe("ProjectContextService", () => {
  it("should materialize shared context in the selected workspace without marking the primary as synced", async () => {
    const project = { id: "project", sourceId: "source", path: "/primary", preferences: {} };
    const updateProjectPreferences = vi.fn();
    const repository = { listProjects: async () => [project], updateProjectPreferences,
      workspaces: { get: async () => ({ id: "secondary", projectId: "project", sourceId: "source",
        path: "/secondary", isPrimary: false, removedAt: null }) }
    } as unknown as OpenCodexCacheRepository;
    const writeFile = vi.fn(async () => undefined);
    const client = { getMetadata: async () => ({ isDirectory: true }),
      createDirectory: async () => undefined, readFile: async () => ({ dataBase64: "" }), writeFile
    } as unknown as CodexAppServerClient;
    const service = new ProjectContextService({ cacheRepository: repository,
      clients: { ensureClient: async () => client } });
    await service.syncProjectContext("project", "secondary");
    expect(writeFile).toHaveBeenCalledWith("/secondary/.codex/config.toml", expect.any(String));
    const config = Buffer.from(writeFile.mock.calls[0][1], "base64").toString("utf8");
    expect(config).toContain('"/secondary" = true');
    expect(config).not.toContain('"/primary" = true');
    expect(updateProjectPreferences).not.toHaveBeenCalled();
  });

  it("should generate a read-only external context profile", () => {
    const block = buildManagedConfigBlock({
      profileId: "opencodex-context",
      projectPath: "/workspace/app",
      externalFolders: [
        { path: "/workspace/app" },
        { path: "/workspace/docs" }
      ]
    });

    expect(block).toContain("[permissions.opencodex-context.workspace_roots]");
    expect(block).toContain("extends = \":workspace\"");
    expect(block).toContain("\"/workspace/app\" = true");
    expect(block).not.toContain("\"/workspace/docs\" = true");
    expect(block).toContain("\"/workspace/docs\" = \"read\"");
    expect(block).not.toContain("\"/workspace/app/**/*.env\" = \"deny\"");
    expect(block).toContain("\"/workspace/docs/**/*.env\" = \"deny\"");
    expect(block).not.toContain("\":minimal\" = \"read\"");
    expect(block).not.toContain("\"**/*.env\" = \"deny\"");
    expect(block).not.toContain("[permissions.opencodex-context.network]");
  });

  it.each([
    { permission: "read", envFilePermission: "read", expectedEnvPermission: "read" },
    { permission: "write", envFilePermission: "write", expectedEnvPermission: "write" },
    { permission: "read", envFilePermission: "write", expectedEnvPermission: "deny" }
  ] as const)(
    "should apply folder permission $permission and compatible env permission",
    ({ permission, envFilePermission, expectedEnvPermission }) => {
      const block = buildManagedConfigBlock({
        profileId: "opencodex-context",
        projectPath: "/workspace/app",
        externalFolders: [{ path: "/workspace/docs", permission, envFilePermission }],
      });

      expect(block).toContain(`"/workspace/docs" = "${permission}"`);
      expect(block).toContain(`"/workspace/docs/**/*.env" = "${expectedEnvPermission}"`);
      expect(block).not.toContain("\"/workspace/app/**/*.env\"");
    }
  );

  it("should replace only the managed config block", () => {
    const previousConfig = [
      "model = \"gpt-5.5\"",
      "",
      "# BEGIN OpenCodexUI managed context permissions",
      "[permissions.opencodex-context]",
      "description = \"Old\"",
      "# END OpenCodexUI managed context permissions",
      ""
    ].join("\n");
    const nextBlock = buildManagedConfigBlock({
      profileId: "opencodex-context",
      projectPath: "/workspace/app",
      externalFolders: [{ path: "/workspace/docs" }]
    });

    const result = replaceManagedBlock(previousConfig, nextBlock, "opencodex-context");

    expect(result).toContain("model = \"gpt-5.5\"");
    expect(result).toContain("default_permissions = \"opencodex-context\"");
    expect(result).toContain("\"/workspace/docs\" = \"read\"");
    expect(result).not.toContain("description = \"Old\"");
    expect(result.indexOf("default_permissions")).toBeLessThan(
      result.indexOf("[permissions.opencodex-context]")
    );
  });

  it("should reject unmanaged profile conflicts", () => {
    const nextBlock = buildManagedConfigBlock({
      profileId: "opencodex-context",
      projectPath: "/workspace/app",
      externalFolders: []
    });

    expect(() => {
      replaceManagedBlock("[permissions.opencodex-context]\ndescription = \"Manual\"\n", nextBlock, "opencodex-context");
    }).toThrow(/already exists/);
  });

  it("should reject unmanaged default permissions conflicts", () => {
    const nextBlock = buildManagedConfigBlock({
      profileId: "opencodex-context",
      projectPath: "/workspace/app",
      externalFolders: []
    });

    expect(() => {
      replaceManagedBlock("default_permissions = \":workspace\"\n", nextBlock, "opencodex-context");
    }).toThrow(/default_permissions/);
  });
});
