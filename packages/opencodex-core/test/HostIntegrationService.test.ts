import type { CachedSource } from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexImageAttachment,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it, vi } from "vitest";

import {
  HostIntegrationService,
  type HostIntegrationServiceOptions
} from "../src/backend/support/HostIntegrationService";

describe("HostIntegrationService", () => {
  it("should delegate host pickers and return safe defaults when unavailable", async () => {
    const images: OpenCodexImageAttachment[] = [{
      id: "image-1",
      path: "/tmp/image.png",
      mimeType: "image/png",
      fileName: "image.png"
    }];
    const pickExecutableFile = vi.fn(() => "/usr/bin/codex");
    const pickImageFiles = vi.fn(() => images);
    const service = createService({ pickExecutableFile, pickImageFiles });

    await expect(service.pickSourceExecutable()).resolves.toBe("/usr/bin/codex");
    await expect(service.pickImageFiles()).resolves.toEqual(images);
    await expect(createService().pickSourceExecutable()).resolves.toBeNull();
    await expect(createService().pickImageFiles()).resolves.toEqual([]);
    expect(pickExecutableFile).toHaveBeenCalledOnce();
    expect(pickImageFiles).toHaveBeenCalledOnce();
  });

  it("should treat an empty link as a successful no-op", async () => {
    const openExternalLink = vi.fn();
    const resolveSource = vi.fn();
    const service = createService({ openExternalLink, resolveSource });

    await expect(service.openLink("  \t", null, null)).resolves.toEqual({ ok: true });
    expect(openExternalLink).not.toHaveBeenCalled();
    expect(resolveSource).not.toHaveBeenCalled();
  });

  it("should report a localized error when a non-empty link has no opener", async () => {
    const service = createService({ language: "fr" });

    await expect(service.openLink("https://example.com", null, null)).rejects.toThrow(
      "Aucun gestionnaire d'ouverture de lien externe n'est configuré."
    );
  });

  it("should open local links with their file command and normalized project path", async () => {
    const openExternalLink = vi.fn();
    const service = createService({
      source: createSource("local", {
        openFileCommand: "code --reuse-window",
        openFolderCommand: "code"
      }),
      projectPath: " /workspace/fallback/ ",
      openExternalLink
    });

    await expect(service.openLink(
      "  https://example.com/docs  ",
      " /workspace/project/ ",
      "local-source"
    )).resolves.toEqual({ ok: true });

    expect(openExternalLink).toHaveBeenCalledWith(
      "https://example.com/docs",
      "/workspace/project/",
      "code --reuse-window"
    );
  });

  it("should use the host project fallback and custom local opener for links", async () => {
    const openExternalLink = vi.fn();
    const service = createService({
      source: createSource("custom", {
        hasLocalAccess: true,
        openFileCommand: "xdg-open"
      }),
      projectPath: " /workspace/fallback/ ",
      openExternalLink
    });

    await service.openLink("https://example.com", "  ", "custom-source");

    expect(openExternalLink).toHaveBeenCalledWith(
      "https://example.com",
      "/workspace/fallback/",
      "xdg-open"
    );
  });

  it("should omit file openers for remote or inaccessible custom sources", async () => {
    const openExternalLink = vi.fn();
    const remoteService = createService({
      source: createSource("wsl"),
      openExternalLink
    });
    const customService = createService({
      source: createSource("custom", { openFileCommand: "xdg-open" }),
      openExternalLink
    });

    await remoteService.openLink("https://example.com", null, "wsl-source");
    await customService.openLink("https://example.com", null, "custom-source");

    expect(openExternalLink).toHaveBeenNthCalledWith(
      1,
      "https://example.com",
      null,
      null
    );
    expect(openExternalLink).toHaveBeenNthCalledWith(
      2,
      "https://example.com",
      null,
      null
    );
  });

  it("should open an IDE for local and custom-local sources with a folder command", async () => {
    const openExternalLink = vi.fn();
    const localService = createService({
      source: createSource("local", { openFolderCommand: "code" }),
      openExternalLink
    });
    const customService = createService({
      source: createSource("custom", {
        hasLocalAccess: true,
        openFolderCommand: "cursor"
      }),
      openExternalLink
    });

    await localService.openProjectInIde("/workspace/local", "local-source");
    await customService.openProjectInIde("/workspace/custom", "custom-source");

    expect(openExternalLink).toHaveBeenNthCalledWith(
      1,
      "/workspace/local",
      "/workspace/local",
      "code"
    );
    expect(openExternalLink).toHaveBeenNthCalledWith(
      2,
      "/workspace/custom",
      "/workspace/custom",
      "cursor"
    );
  });

  it("should no-op IDE requests without a source, command, access, or opener", async () => {
    const openExternalLink = vi.fn();
    const resolveSource = vi.fn(async () => createSource("wsl"));
    const service = createService({ openExternalLink, resolveSource });

    await expect(service.openProjectInIde("/workspace/project", null)).resolves.toEqual({ ok: true });
    await expect(service.openProjectInIde("/workspace/project", "remote-source"))
      .resolves.toEqual({ ok: true });
    expect(openExternalLink).not.toHaveBeenCalled();
    expect(resolveSource).toHaveBeenCalledOnce();
  });

  it("should restrict folder and terminal actions to local sources", async () => {
    const openProjectFolder = vi.fn();
    const openProjectTerminal = vi.fn();
    const resolveSource = vi.fn(async (sourceId: string) => (
      sourceId === "local-source"
        ? createSource("local")
        : sourceId === "custom-source"
          ? createSource("custom", { hasLocalAccess: true })
          : createSource("wsl")
    ));
    const service = createService({
      resolveSource,
      openProjectFolder,
      openProjectTerminal
    });

    await service.openProjectFolder("/workspace/local", "local-source");
    await service.openProjectTerminal("/workspace/local", "local-source");
    await service.openProjectFolder("/workspace/custom", "custom-source");
    await service.openProjectTerminal("/workspace/remote", "remote-source");
    await service.openProjectFolder("/workspace/orphan", null);

    expect(openProjectFolder).toHaveBeenCalledWith("/workspace/local");
    expect(openProjectTerminal).toHaveBeenCalledWith("/workspace/local");
    expect(openProjectFolder).toHaveBeenCalledOnce();
    expect(openProjectTerminal).toHaveBeenCalledOnce();
  });

  it("should no-op host actions when callbacks are absent and propagate failures", async () => {
    const resolveSource = vi.fn(async () => createSource("local"));
    const service = createService({ resolveSource });

    await expect(service.openProjectFolder("/workspace/project", "local-source"))
      .resolves.toEqual({ ok: true });

    const failure = new Error("terminal unavailable");
    const failingService = createService({
      resolveSource,
      openProjectTerminal: vi.fn(() => {
        throw failure;
      })
    });

    await expect(failingService.openProjectTerminal("/workspace/project", "local-source"))
      .rejects.toBe(failure);
  });
});

/** Creates a host integration service with deterministic test defaults. */
function createService(
  overrides: Partial<HostIntegrationServiceOptions> & {
    source?: CachedSource;
    language?: "en" | "fr";
    projectPath?: string | null;
    resolveSource?: (sourceId: string) => Promise<CachedSource>;
  } = {}
): HostIntegrationService {
  const source = overrides.source ?? createSource("local");
  const resolveSource = overrides.resolveSource ?? vi.fn(async () => source);

  return new HostIntegrationService({
    settings: {
      getSettings: () => ({ language: overrides.language ?? "en" } as OpenCodexSettings)
    },
    projectPath: overrides.projectPath ?? null,
    projects: { resolveSource },
    pickExecutableFile: overrides.pickExecutableFile,
    pickImageFiles: overrides.pickImageFiles,
    openExternalLink: overrides.openExternalLink,
    openProjectFolder: overrides.openProjectFolder,
    openProjectTerminal: overrides.openProjectTerminal
  });
}

/** Builds a complete cached source fixture for one source kind. */
function createSource(
  kind: CachedSource["kind"],
  options: {
    hasLocalAccess?: boolean;
    openFileCommand?: string | null;
    openFolderCommand?: string | null;
  } = {}
): CachedSource {
  const base = {
    id: `${kind}-source`,
    name: `${kind} source`,
    lastDetectedCodexVersion: null,
    lastDetectedCodexAt: null,
    lastDetectionError: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };

  if (kind === "local") {
    return {
      ...base,
      kind,
      settings: {
        commandMode: "auto",
        command: null,
        color: "blue",
        openFileCommand: options.openFileCommand ?? null,
        openFolderCommand: options.openFolderCommand ?? null
      }
    };
  }

  if (kind === "custom") {
    return {
      ...base,
      kind,
      settings: {
        commandMode: "custom",
        command: "codex-custom",
        hasLocalAccess: options.hasLocalAccess ?? false,
        color: "blue",
        openFileCommand: options.openFileCommand ?? null,
        openFolderCommand: options.openFolderCommand ?? null
      }
    };
  }

  if (kind === "wsl") {
    return {
      ...base,
      kind,
      settings: {
        distro: null,
        codexCommand: "codex",
        color: "blue"
      }
    };
  }

  return {
    ...base,
    kind,
    settings: {
      host: "example.com",
      user: null,
      port: null,
      identityFile: null,
      codexCommand: "codex",
      color: "blue"
    }
  };
}
