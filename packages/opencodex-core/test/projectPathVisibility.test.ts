/**
 * Covers source-local project path visibility checks.
 */
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type { CachedSource } from "@open-codex-ui/opencodex-cache";
import { describe, expect, it, vi } from "vitest";

import { ProjectPathVisibilityValidator } from "../src/backend/projectPathVisibility";

describe("ProjectPathVisibilityValidator", () => {
  it("should use Codex filesystem metadata for custom sources", async () => {
    const request = vi.fn(async () => ({ isDirectory: true }));
    const validator = new ProjectPathVisibilityValidator(
      createSource("custom"),
      createClient(request)
    );

    await expect(validator.shouldHideProjectPath("/wsl/project")).resolves.toBe(false);

    expect(request).toHaveBeenCalledWith("fs/getMetadata", { path: "/wsl/project" });
  });

  it("should cache source-local validation by project path", async () => {
    const request = vi.fn(async () => ({ isDirectory: true }));
    const validator = new ProjectPathVisibilityValidator(
      createSource("custom"),
      createClient(request)
    );

    await validator.shouldHideProjectPath("/wsl/project");
    await validator.shouldHideProjectPath("/wsl/project");

    expect(request).toHaveBeenCalledTimes(1);
  });

  it("should hide source-local paths that resolve to non-directories", async () => {
    const request = vi.fn(async () => ({ isDirectory: false }));
    const validator = new ProjectPathVisibilityValidator(
      createSource("custom"),
      createClient(request)
    );

    await expect(validator.shouldHideProjectPath("/wsl/file.txt")).resolves.toBe(true);
  });

  it("should hide source-local paths that Codex reports as missing", async () => {
    const request = vi.fn(async () => {
      throw new Error("No such file or directory");
    });
    const validator = new ProjectPathVisibilityValidator(
      createSource("custom"),
      createClient(request)
    );

    await expect(validator.shouldHideProjectPath("/wsl/missing")).resolves.toBe(true);
  });

  it("should keep source-local paths visible when validation is unsupported", async () => {
    const request = vi.fn(async () => {
      throw new Error("Method not found: fs/getMetadata");
    });
    const validator = new ProjectPathVisibilityValidator(
      createSource("custom"),
      createClient(request)
    );

    await expect(validator.shouldHideProjectPath("/wsl/project")).resolves.toBe(false);
  });
});

function createSource(commandMode: CachedSource["settings"]["commandMode"]): CachedSource {
  return {
    id: "source-1",
    kind: "local",
    name: "Source",
    settings: {
      commandMode,
      command: null,
      color: "blue"
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function createClient(
  request: (method: string, params?: unknown) => Promise<unknown>
): CodexAppServerClient {
  return { request } as CodexAppServerClient;
}
