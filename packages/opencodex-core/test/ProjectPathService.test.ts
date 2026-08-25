/**
 * Covers source-owned project path validation without touching a real filesystem.
 */
import type { CachedSource } from "@open-codex-ui/opencodex-cache";
import { normalizeProjectPath } from "@open-codex-ui/opencodex-cache";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import { describe, expect, it, vi } from "vitest";

import {
  ProjectPathService,
  type ProjectPathServiceOptions
} from "../src/backend/projects/ProjectPathService";

describe("ProjectPathService", () => {
  it("should delegate local paths to the host and normalize the ensured result", async () => {
    const projectPath = "/workspace/input-project";
    const ensuredPath = "/workspace/ensured-project/";
    const ensureProjectDirectory = vi.fn(async () => ensuredPath);
    const { service, ensureClient } = createService({ ensureProjectDirectory });

    await expect(service.ensure(projectPath, true, createLocalSource())).resolves.toBe(
      normalizeProjectPath(ensuredPath)
    );

    expect(ensureProjectDirectory).toHaveBeenCalledOnce();
    expect(ensureProjectDirectory).toHaveBeenCalledWith(projectPath, true);
    expect(ensureClient).not.toHaveBeenCalled();
  });

  it("should normalize a local path when the host callback is absent", async () => {
    const projectPath = "/workspace/project/";
    const { service, ensureClient } = createService();

    await expect(service.ensure(projectPath, false, createLocalSource())).resolves.toBe(
      normalizeProjectPath(projectPath)
    );

    expect(ensureClient).not.toHaveBeenCalled();
  });

  it("should read the current host callback and preserve its receiver", async () => {
    const firstCallback = vi.fn(async () => "/workspace/first");
    const host = {
      marker: "/workspace/replaced",
      ensureProjectDirectory: firstCallback
    };
    const client = createClient();
    const service = new ProjectPathService({
      host,
      clients: { ensureClient: vi.fn(async () => client) }
    });
    const replacementCallback = vi.fn(async function (this: typeof host) {
      return this.marker;
    });
    host.ensureProjectDirectory = replacementCallback;

    await expect(service.ensure("/workspace/input", false, createLocalSource())).resolves.toBe(
      normalizeProjectPath(host.marker)
    );

    expect(firstCallback).not.toHaveBeenCalled();
    expect(replacementCallback).toHaveBeenCalledWith("/workspace/input", false);
  });

  it("should reject an empty local path returned by the host callback", async () => {
    const ensureProjectDirectory = vi.fn(async () => "   ");
    const { service } = createService({ ensureProjectDirectory });

    await expect(service.ensure("/workspace/project", false, createLocalSource())).rejects.toMatchObject({
      message: "Project path is required."
    });
  });

  it.each([
    "C:\\Users\\Ada\\Projects\\OpenCodexUI\\",
    "\\\\server\\share\\OpenCodexUI\\"
  ])("should normalize local Windows and UNC paths using the shared path normalizer", async (projectPath) => {
    const ensureProjectDirectory = vi.fn(async () => projectPath);
    const { service } = createService({ ensureProjectDirectory });

    await expect(service.ensure(projectPath, false, createLocalSource())).resolves.toBe(
      normalizeProjectPath(projectPath)
    );

    expect(ensureProjectDirectory).toHaveBeenCalledWith(projectPath, false);
  });

  it.each(["wsl", "ssh", "custom"] as const)(
    "should validate a %s path through its source client without using the host",
    async (kind) => {
      const projectPath = "/home/adrien/projects/OpenCodexUI";
      const ensureProjectDirectory = vi.fn(async () => {
        throw new Error("The remote path must not be resolved on the host.");
      });
      const client = createClient();
      const { service, ensureClient } = createService({
        ensureProjectDirectory,
        client
      });

      await expect(service.ensure(projectPath, false, createRemoteSource(kind))).resolves.toBe(
        projectPath
      );

      expect(ensureClient).toHaveBeenCalledOnce();
      expect(ensureClient).toHaveBeenCalledWith(`source-${kind}`);
      expect(client.getMetadata).toHaveBeenCalledOnce();
      expect(client.getMetadata).toHaveBeenCalledWith(projectPath);
      expect(ensureProjectDirectory).not.toHaveBeenCalled();
    }
  );

  it("should reject a remote path that is not a directory", async () => {
    const projectPath = "/home/adrien/projects/file.txt";
    const client = createClient();
    vi.mocked(client.getMetadata).mockResolvedValueOnce({ isDirectory: false });
    const { service } = createService({ client });

    await expect(service.ensure(projectPath, true, createRemoteSource("wsl"))).rejects.toMatchObject({
      message: `Project path is not a directory: ${projectPath}`
    });

    expect(client.createDirectory).not.toHaveBeenCalled();
  });

  it.each(["ENOENT: no such file or directory", "path not found"])(
    "should create a missing remote path when creation is enabled (%s)",
    async (message) => {
      const projectPath = "/home/adrien/projects/new-project";
      const client = createClient();
      const missingError = new Error(message);
      vi.mocked(client.getMetadata).mockRejectedValueOnce(missingError);
      const { service } = createService({ client });

      await expect(service.ensure(projectPath, true, createRemoteSource("ssh"))).resolves.toBe(
        projectPath
      );

      expect(client.createDirectory).toHaveBeenCalledOnce();
      expect(client.createDirectory).toHaveBeenCalledWith(projectPath);
    }
  );

  it.each(["ENOENT: no such file or directory", "path not found"])(
    "should propagate a missing remote path when creation is disabled (%s)",
    async (message) => {
      const projectPath = "/home/adrien/projects/missing-project";
      const client = createClient();
      const missingError = new Error(message);
      vi.mocked(client.getMetadata).mockRejectedValueOnce(missingError);
      const { service } = createService({ client });

      await expect(service.ensure(projectPath, false, createRemoteSource("wsl"))).rejects.toBe(
        missingError
      );

      expect(client.createDirectory).not.toHaveBeenCalled();
    }
  );

  it("should propagate non-missing remote errors without creating a directory", async () => {
    const projectPath = "/home/adrien/projects/inaccessible-project";
    const client = createClient();
    const permissionError = new Error("EACCES: permission denied");
    vi.mocked(client.getMetadata).mockRejectedValueOnce(permissionError);
    const { service } = createService({ client });

    await expect(service.ensure(projectPath, true, createRemoteSource("ssh"))).rejects.toBe(
      permissionError
    );

    expect(client.createDirectory).not.toHaveBeenCalled();
  });

  it.each(["wsl", "ssh"] as const)(
    "should reject an empty %s path before ensuring its source client",
    async (kind) => {
      const client = createClient();
      const { service, ensureClient } = createService({ client });

      await expect(service.ensure("  ", true, createRemoteSource(kind))).rejects.toMatchObject({
        message: "Project path is required."
      });

      expect(ensureClient).not.toHaveBeenCalled();
      expect(client.getMetadata).not.toHaveBeenCalled();
    }
  );
});

/** Builds a service with deterministic host and source-client test doubles. */
function createService(options: {
  ensureProjectDirectory?: ProjectPathServiceOptions["host"]["ensureProjectDirectory"];
  client?: CodexAppServerClient;
} = {}) {
  const client = options.client ?? createClient();
  const ensureClient = vi.fn(async () => client);
  const service = new ProjectPathService({
    host: { ensureProjectDirectory: options.ensureProjectDirectory },
    clients: { ensureClient }
  });

  return { service, ensureClient, client };
}

/** Creates the smallest local source shape needed by the path service. */
function createLocalSource(): CachedSource {
  return {
    id: "source-local",
    name: "Local",
    kind: "local",
    settings: {
      commandMode: "auto",
      command: null,
      color: "blue",
      openFolderCommand: null,
      openFileCommand: null
    },
    lastDetectedCodexVersion: null,
    lastDetectedCodexAt: null,
    lastDetectionError: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

/** Creates a minimal source whose filesystem belongs to WSL or SSH. */
function createRemoteSource(kind: "wsl" | "ssh" | "custom"): CachedSource {
  const common = {
    id: `source-${kind}`,
    name: kind.toUpperCase(),
    lastDetectedCodexVersion: null,
    lastDetectedCodexAt: null,
    lastDetectionError: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };

  if (kind === "wsl") {
    return {
      ...common,
      kind,
      settings: {
        distro: null,
        codexCommand: "codex",
        color: "blue"
      }
    };
  }

  if (kind === "custom") {
    return {
      ...common,
      kind,
      settings: {
        commandMode: "custom",
        command: "codex",
        hasLocalAccess: false,
        color: "blue",
        openFolderCommand: null,
        openFileCommand: null
      }
    };
  }

  return {
    ...common,
    kind,
    settings: {
      host: "example.test",
      user: null,
      port: null,
      identityFile: null,
      codexCommand: "codex",
      color: "blue"
    }
  };
}

/** Creates a source client double with only the filesystem methods under test. */
function createClient(): CodexAppServerClient {
  return {
    getMetadata: vi.fn(async () => ({ isDirectory: true })),
    createDirectory: vi.fn(async () => ({}))
  } as unknown as CodexAppServerClient;
}
