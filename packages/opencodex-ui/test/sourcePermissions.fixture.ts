import { vi } from "vitest";
import type { OpenCodexSource, SourcePermissionsSnapshot } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../src/stores/RootStore";
import { SourcePermissionsStore } from "../src/stores/app/SourcePermissionsStore";

/** Configured defaults are independent of active chats and Home filters. */
export function sourcePermissionSnapshot(patch: Partial<SourcePermissionsSnapshot> = {}): SourcePermissionsSnapshot {
  return { sourceId: "source-a", configPath: "/native/home/config.toml", revision: "version-1", profileId: null,
    filesystem: "read-only", networkAccess: false, approvalPolicy: "on-request", approvalsReviewer: "user",
    writableRoots: [], editable: { filesystem: true, networkAccess: true, approvalPolicy: true, approvalsReviewer: true },
    allowedFilesystems: ["read-only", "workspace-write"], allowedPolicies: ["on-request", "untrusted", "never"],
    allowedReviewers: ["user", "auto_review"], sharedSourceIds: [], ...patch };
}

/** Host source metadata with no actual executable access during tests. */
export function permissionSource(): OpenCodexSource {
  return { id: "source-a", kind: "local", name: "Local test", associatedProjectCount: 0,
    codex: { status: "ready", version: "0.163.0", message: null, checkedAt: "fixed" },
    codexUpdate: { supported: false, updateAvailable: false, latestVersion: null, checkedAt: null, message: null },
    settings: { color: "blue", commandMode: "auto", command: null, openFileCommand: null, openFolderCommand: null },
    resolvedCommand: "codex", commandCandidates: [], createdAt: "fixed", updatedAt: "fixed" };
}

/** Keeps native I/O mocked while using the actual permission store and components. */
export function createSourcePermissionsFixture() {
  const request = vi.fn().mockResolvedValue(sourcePermissionSnapshot());
  const source = permissionSource();
  const root = { request, sourcesStore: {
    isSourceReady: vi.fn(() => true), isSourceSyncing: vi.fn(() => false),
    findSource: vi.fn((id: string) => ({ ...source, id, name: `Source ${id}` })), updateSource: vi.fn()
  }, usageStore: { getSourceUsage: vi.fn(() => undefined) },
    appStore: { settingsStore: { setDefaultSourceId: vi.fn() } }
  } as unknown as RootStore;
  const permissions = new SourcePermissionsStore(root, source.id);
  return { root, request, source, permissions };
}
