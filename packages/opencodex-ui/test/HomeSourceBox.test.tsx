import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

import type { OpenCodexSource } from "@open-codex-ui/opencodex-protocol";

import { HomeSourceBox } from "../src/components/home/HomeSourceBox";
import type { RootStore } from "../src/stores/RootStore";

describe("HomeSourceBox", () => {
  it("should render source identity and Codex status from the provided source", () => {
    const markup = renderToStaticMarkup(
      <HomeSourceBox
        source={createSource()}
        store={createRootStore()}
        isDefault={false}
        isEditing={false}
        onEdit={vi.fn()}
        onCloseEdit={vi.fn()}
      />
    );

    expect(markup).toContain("Local source");
    expect(markup).toContain("codex app-server");
    expect(markup).toContain("sources.kindLocal");
    expect(markup).toContain("sources.codexDetected");
    expect(markup).toContain("sources.setDefault");
  });
});

/** Creates a local source card fixture. */
function createSource(): OpenCodexSource {
  return {
    id: "source-1",
    kind: "local",
    name: "Local source",
    associatedProjectCount: 0,
    codex: {
      status: "ready",
      version: "1.2.3",
      message: null,
      checkedAt: "2026-08-12T10:00:00.000Z"
    },
    codexUpdate: {
      supported: true,
      updateAvailable: false,
      latestVersion: "1.2.3",
      checkedAt: "2026-08-12T10:00:00.000Z",
      message: null
    },
    settings: {
      color: "blue",
      commandMode: "auto",
      command: null,
      openFolderCommand: null,
      openFileCommand: null
    },
    resolvedCommand: "codex app-server",
    commandCandidates: [],
    createdAt: "2026-08-12T10:00:00.000Z",
    updatedAt: "2026-08-12T10:00:00.000Z"
  };
}

/** Creates the read-only store surface consumed during card rendering. */
function createRootStore(): RootStore {
  return {
    sourcesStore: {
      isSourceSyncing: vi.fn(() => false)
    },
    usageStore: {
      getSourceUsage: vi.fn(() => undefined)
    },
    appStore: {
      setDefaultSourceId: vi.fn()
    }
  } as unknown as RootStore;
}
