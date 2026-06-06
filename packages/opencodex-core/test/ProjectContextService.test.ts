import { describe, expect, it } from "vitest";

import {
  buildManagedConfigBlock,
  replaceManagedBlock
} from "../src/backend/ProjectContextService";

describe("ProjectContextService", () => {
  it("should generate a read-only external context profile", () => {
    const block = buildManagedConfigBlock({
      profileId: "opencodex-context",
      projectPath: "/workspace/app",
      externalPaths: ["/workspace/docs"]
    });

    expect(block).toContain("[permissions.opencodex-context.workspace_roots]");
    expect(block).toContain("extends = \":workspace\"");
    expect(block).toContain("\"/workspace/app\" = true");
    expect(block).not.toContain("\"/workspace/docs\" = true");
    expect(block).toContain("\"/workspace/docs\" = \"read\"");
    expect(block).toContain("\"/workspace/app/**/*.env\" = \"deny\"");
    expect(block).toContain("\"/workspace/docs/**/*.env\" = \"deny\"");
    expect(block).not.toContain("\":minimal\" = \"read\"");
    expect(block).not.toContain("\"**/*.env\" = \"deny\"");
    expect(block).not.toContain("[permissions.opencodex-context.network]");
  });

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
      externalPaths: ["/workspace/docs"]
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
      externalPaths: []
    });

    expect(() => {
      replaceManagedBlock("[permissions.opencodex-context]\ndescription = \"Manual\"\n", nextBlock, "opencodex-context");
    }).toThrow(/already exists/);
  });

  it("should reject unmanaged default permissions conflicts", () => {
    const nextBlock = buildManagedConfigBlock({
      profileId: "opencodex-context",
      projectPath: "/workspace/app",
      externalPaths: []
    });

    expect(() => {
      replaceManagedBlock("default_permissions = \":workspace\"\n", nextBlock, "opencodex-context");
    }).toThrow(/default_permissions/);
  });
});
