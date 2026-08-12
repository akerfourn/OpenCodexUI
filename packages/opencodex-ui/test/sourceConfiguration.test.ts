import { describe, expect, it } from "vitest";

import type { OpenCodexSource } from "@open-codex-ui/opencodex-protocol";

import {
  buildSourceSettings,
  createSourceDraft,
  sourceToDraft,
  validateSourceDraft
} from "../src/components/home/sourceConfiguration";

const SOURCE_METADATA: Pick<
  OpenCodexSource,
  "id" | "name" | "associatedProjectCount" | "codex" | "codexUpdate" | "createdAt" | "updatedAt"
> = {
  id: "source-id",
  name: "Test source",
  associatedProjectCount: 0,
  codex: {
    status: "ready",
    version: "1.0.0",
    message: null,
    checkedAt: "2025-01-01T00:00:00.000Z"
  },
  codexUpdate: {
    supported: true,
    updateAvailable: false,
    latestVersion: "1.0.0",
    checkedAt: "2025-01-01T00:00:00.000Z",
    message: null
  },
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z"
};

describe("source configuration", () => {
  it("should create drafts with all default values for every source kind", () => {
    expect(createSourceDraft("local")).toEqual({
      kind: "local",
      color: "blue",
      command: "",
      hasLocalAccess: true,
      openFolderCommand: "",
      openFileCommand: "",
      distro: "",
      codexCommand: "codex",
      host: "",
      user: "",
      port: "",
      identityFile: ""
    });
    expect(createSourceDraft("custom")).toEqual({
      kind: "custom",
      color: "blue",
      command: "",
      hasLocalAccess: false,
      openFolderCommand: "",
      openFileCommand: "",
      distro: "",
      codexCommand: "codex",
      host: "",
      user: "",
      port: "",
      identityFile: ""
    });
    expect(createSourceDraft("wsl")).toEqual({
      kind: "wsl",
      color: "blue",
      command: "",
      hasLocalAccess: false,
      openFolderCommand: "",
      openFileCommand: "",
      distro: "",
      codexCommand: "codex",
      host: "",
      user: "",
      port: "",
      identityFile: ""
    });
    expect(createSourceDraft("ssh")).toEqual({
      kind: "ssh",
      color: "blue",
      command: "",
      hasLocalAccess: false,
      openFolderCommand: "",
      openFileCommand: "",
      distro: "",
      codexCommand: "codex",
      host: "",
      user: "",
      port: "",
      identityFile: ""
    });
  });

  it("should convert local source settings to a draft", () => {
    const source: OpenCodexSource = {
      ...SOURCE_METADATA,
      kind: "local",
      settings: {
        color: "teal",
        commandMode: "auto",
        command: null,
        openFolderCommand: "code %D",
        openFileCommand: null
      },
      resolvedCommand: "codex",
      commandCandidates: []
    };

    expect(sourceToDraft(source)).toEqual({
      kind: "local",
      color: "teal",
      command: "",
      hasLocalAccess: true,
      openFolderCommand: "code %D",
      openFileCommand: "",
      distro: "",
      codexCommand: "codex",
      host: "",
      user: "",
      port: "",
      identityFile: ""
    });
  });

  it("should convert custom source settings to a draft", () => {
    const source: OpenCodexSource = {
      ...SOURCE_METADATA,
      kind: "custom",
      settings: {
        color: "purple",
        commandMode: "custom",
        command: "/opt/codex",
        hasLocalAccess: true,
        openFolderCommand: "code %D",
        openFileCommand: "code --goto %F:%L:%C"
      },
      resolvedCommand: "/opt/codex",
      commandCandidates: []
    };

    expect(sourceToDraft(source)).toEqual({
      kind: "custom",
      color: "purple",
      command: "/opt/codex",
      hasLocalAccess: true,
      openFolderCommand: "code %D",
      openFileCommand: "code --goto %F:%L:%C",
      distro: "",
      codexCommand: "codex",
      host: "",
      user: "",
      port: "",
      identityFile: ""
    });
  });

  it("should convert null custom optional settings to empty strings", () => {
    const source: OpenCodexSource = {
      ...SOURCE_METADATA,
      kind: "custom",
      settings: {
        color: "purple",
        commandMode: "custom",
        command: null,
        hasLocalAccess: false,
        openFolderCommand: null,
        openFileCommand: null
      },
      resolvedCommand: "codex",
      commandCandidates: []
    };

    const draft = sourceToDraft(source);

    expect({
      command: draft.command,
      openFolderCommand: draft.openFolderCommand,
      openFileCommand: draft.openFileCommand
    }).toEqual({
      command: "",
      openFolderCommand: "",
      openFileCommand: ""
    });
  });

  it("should convert WSL source settings to a draft", () => {
    const source: OpenCodexSource = {
      ...SOURCE_METADATA,
      kind: "wsl",
      settings: {
        color: "orange",
        distro: "Ubuntu-22.04",
        codexCommand: "codex --profile dev"
      },
      resolvedCommand: "wsl.exe",
      commandCandidates: []
    };

    expect(sourceToDraft(source)).toEqual({
      kind: "wsl",
      color: "orange",
      command: "",
      hasLocalAccess: false,
      openFolderCommand: "",
      openFileCommand: "",
      distro: "Ubuntu-22.04",
      codexCommand: "codex --profile dev",
      host: "",
      user: "",
      port: "",
      identityFile: ""
    });
  });

  it("should convert SSH source settings to a draft", () => {
    const source: OpenCodexSource = {
      ...SOURCE_METADATA,
      kind: "ssh",
      settings: {
        color: "red",
        host: "server.example.com",
        user: "deploy",
        port: 2222,
        identityFile: "~/.ssh/id_ed25519",
        codexCommand: "codex"
      },
      resolvedCommand: "ssh",
      commandCandidates: []
    };

    expect(sourceToDraft(source)).toEqual({
      kind: "ssh",
      color: "red",
      command: "",
      hasLocalAccess: false,
      openFolderCommand: "",
      openFileCommand: "",
      distro: "",
      codexCommand: "codex",
      host: "server.example.com",
      user: "deploy",
      port: "2222",
      identityFile: "~/.ssh/id_ed25519"
    });
  });

  it("should build the exact local settings DTO", () => {
    expect(
      buildSourceSettings({
        ...createSourceDraft("local"),
        color: "indigo",
        openFolderCommand: " code %D ",
        openFileCommand: "   "
      })
    ).toEqual({
      color: "indigo",
      commandMode: "auto",
      command: null,
      openFolderCommand: "code %D",
      openFileCommand: null
    });
  });

  it("should build the exact custom settings DTO", () => {
    expect(
      buildSourceSettings({
        ...createSourceDraft("custom"),
        color: "purple",
        command: " /opt/codex ",
        hasLocalAccess: true,
        openFolderCommand: " code %D ",
        openFileCommand: " code --goto %F:%L:%C "
      })
    ).toEqual({
      color: "purple",
      commandMode: "custom",
      command: "/opt/codex",
      hasLocalAccess: true,
      openFolderCommand: "code %D",
      openFileCommand: "code --goto %F:%L:%C"
    });
  });

  it("should build the exact WSL settings DTO with safe defaults", () => {
    expect(
      buildSourceSettings({
        ...createSourceDraft("wsl"),
        color: "orange",
        distro: "   ",
        codexCommand: "   "
      })
    ).toEqual({
      color: "orange",
      distro: null,
      codexCommand: "codex"
    });
  });

  it("should build the exact SSH settings DTO", () => {
    expect(
      buildSourceSettings({
        ...createSourceDraft("ssh"),
        color: "red",
        host: " server.example.com ",
        user: " deploy ",
        port: " 2222 ",
        identityFile: " ~/.ssh/id_ed25519 ",
        codexCommand: " codex --profile dev "
      })
    ).toEqual({
      color: "red",
      host: "server.example.com",
      user: "deploy",
      port: 2222,
      identityFile: "~/.ssh/id_ed25519",
      codexCommand: "codex --profile dev"
    });
  });

  it("should require a custom command", () => {
    expect(validateSourceDraft({ ...createSourceDraft("custom"), command: "   " })).toBe(
      "sources.validation.commandRequired"
    );
  });

  it("should require an SSH host", () => {
    expect(validateSourceDraft({ ...createSourceDraft("ssh"), host: "   " })).toBe(
      "sources.validation.hostRequired"
    );
  });

  it.each([
    ["non-integer", "22.5"],
    ["below the minimum", "0"],
    ["above the maximum", "65536"]
  ])("should reject an SSH port %s", (_description, port) => {
    expect(
      validateSourceDraft({
        ...createSourceDraft("ssh"),
        host: "server.example.com",
        port
      })
    ).toBe("sources.validation.portInvalid");
  });

  it("should accept a valid custom command and SSH port", () => {
    expect(
      validateSourceDraft({
        ...createSourceDraft("custom"),
        command: "/opt/codex"
      })
    ).toBeNull();
    expect(
      validateSourceDraft({
        ...createSourceDraft("ssh"),
        host: "server.example.com",
        port: "65535"
      })
    ).toBeNull();
  });

  it("should accept an absent SSH port and the lower bound", () => {
    const draft = {
      ...createSourceDraft("ssh"),
      host: "server.example.com"
    };

    expect(validateSourceDraft(draft)).toBeNull();
    expect(validateSourceDraft({ ...draft, port: "1" })).toBeNull();
  });
});
