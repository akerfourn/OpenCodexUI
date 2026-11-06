import type { CachedSource } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it, vi } from "vitest";

import { SourceCatalogService } from "../src/backend/sources/SourceCatalogService";
import { createDefaultCachedSource } from "../src/backend/sources/sourceMapping";

vi.mock("@open-codex-ui/codex-rpc", async () => ({
  ...await vi.importActual<typeof import("@open-codex-ui/codex-rpc")>("@open-codex-ui/codex-rpc"),
  resolveCodexCommandPath: vi.fn(() => { throw new Error("Startup must not discover executables on the host"); })
}));

describe("Source catalog startup snapshots", () => {
  it("should restore local and WSL metadata without running installation or version checks", async () => {
    const local: CachedSource = {
      ...createDefaultCachedSource(), id: "local", name: "Local",
      lastDetectedCodexVersion: "0.163.0", lastDetectedCodexAt: "2026-11-05T00:00:00.000Z"
    };
    const wsl: CachedSource = {
      ...local, id: "wsl", name: "Ubuntu", kind: "wsl",
      settings: { color: "blue", distro: "Ubuntu", codexCommand: "/home/test/.local/bin/codex" }
    };
    const fixture = createFixture([local, wsl]);

    const snapshots = await fixture.service.listCachedOpenCodexSources();

    expect(snapshots).toMatchObject([
      { id: "local", kind: "local", name: "Local", associatedProjectCount: 2,
        codex: { status: "ready", version: "0.163.0", checkedAt: local.lastDetectedCodexAt } },
      { id: "wsl", kind: "wsl", name: "Ubuntu", associatedProjectCount: 2,
        settings: wsl.settings, resolvedCommand: "wsl.exe --distribution 'Ubuntu' /home/test/.local/bin/codex" }
    ]);
    expect(snapshots.every(source => source.commandCandidates.length === 0)).toBe(true);
    expect(snapshots.every(source => !source.codexUpdate.supported)).toBe(true);
    expect(() => structuredClone(snapshots)).not.toThrow();
    expect(fixture.detection.readCommandCandidates).not.toHaveBeenCalled();
    expect(fixture.detection.readAndStoreCodexVersionStatus).not.toHaveBeenCalled();
    expect(fixture.updates.getSourceUpdateStatus).not.toHaveBeenCalled();
  });

  it.each([
    { version: null, error: null, expected: "unavailable" },
    { version: "0.163.0", error: "Command failed", expected: "unavailable" },
    { version: "0.100.0", error: null, expected: "outdated" },
    { version: "0.100.0", error: "Codex CLI 0.100.0 is older than required 0.147.0.", expected: "outdated" },
    { version: "0.100.0", error: "Command failed", expected: "unavailable" }
  ])("should preserve $expected availability for version $version and error $error", async ({ version, error, expected }) => {
    const fixture = createFixture([{
      ...createDefaultCachedSource(), lastDetectedCodexVersion: version, lastDetectionError: error
    }]);

    const [source] = await fixture.service.listCachedOpenCodexSources();

    expect(source?.codex).toMatchObject({ status: expected, version, message: error });
  });

  it("should expose a fallback source without live probes when persistence is unavailable", async () => {
    const fixture = createFixture(null);

    await expect(fixture.service.listCachedOpenCodexSources()).resolves.toMatchObject([
      { id: "default", associatedProjectCount: 0, codex: { status: "unavailable", version: null } }
    ]);
    expect(fixture.detection.readCommandCandidates).not.toHaveBeenCalled();
    expect(fixture.detection.readAndStoreCodexVersionStatus).not.toHaveBeenCalled();
    expect(fixture.updates.getSourceUpdateStatus).not.toHaveBeenCalled();
  });
});

/** Builds strict persistence and probe boundaries; startup must never call a live probe. */
function createFixture(sources: CachedSource[] | null) {
  const detection = {
    readCommandCandidates: vi.fn().mockRejectedValue(new Error("Unexpected command discovery")),
    readAndStoreCodexVersionStatus: vi.fn().mockRejectedValue(new Error("Unexpected version probe"))
  };
  const updates = { getSourceUpdateStatus: vi.fn().mockRejectedValue(new Error("Unexpected update probe")) };
  let cacheRepository = null;
  if (sources !== null) {
    cacheRepository = {
      listSources: vi.fn(async () => sources),
      getSourceProjectCount: vi.fn(async () => 2),
      ensureDefaultSource: vi.fn(), createSource: vi.fn(), updateSource: vi.fn(),
      clearSourceAssociations: vi.fn(), deleteSource: vi.fn()
    };
  }
  const service = new SourceCatalogService({
    cacheRepository, detection, updates, host: {}, clients: { restartClient: vi.fn() },
    settings: { getSettings: createSettings, setSettings: vi.fn() }
  });
  return { service, detection, updates };
}

/** Supplies deterministic settings without touching host configuration. */
function createSettings(): OpenCodexSettings {
  return {
    codexCommand: "codex",
    codexReleaseCheck: { latestVersion: "0.163.0", checkedAt: "2026-11-05T00:00:00.000Z", error: null },
    defaultSourceId: "local", defaultUsageLimitId: null, defaultModel: null,
    defaultReasoningEffort: null, commitMessageModel: null, commitMessageReasoningEffort: null,
    commitMessageLanguage: "en", showActivityPanel: true, experimentalApi: false, allowTurnSteering: true,
    language: "en", colorScheme: "system", enterKeyBehavior: "smart", versioningVocabulary: "technical",
    desktopNotifications: { turnCompleted: false, approvalRequested: false },
    discordRichPresenceEnabled: false, onboardingCompleted: true, allowOutdatedCodex: false,
    developerMode: false, performanceMonitoringEnabled: false, advancedPerformanceMonitoringEnabled: false
  };
}
