/**
 * Covers project preference DTO conversion before UI/backend transport.
 */
import { describe, expect, it } from "vitest";

import { cloneProjectPreferences } from "../src/stores/project/projectPreferencesDto";

describe("project preferences DTO", () => {
  it("should clone nested context folders into plain objects", () => {
    const sourceFolder = {
      id: "folder-1",
      path: "/workspace/docs",
      label: "Docs",
      enabled: true,
      permission: "write",
      envFilePermission: "read"
    };
    const preferences = {
      git: {
        referenceTagName: "v1.0.0",
        deferredPaths: ["src/experimental.ts"]
      },
      context: {
        permissionsProfileId: "opencodex-context",
        folders: [sourceFolder],
        lastSyncedAt: "2026-06-27T10:00:00.000Z"
      }
    };

    const clonedPreferences = cloneProjectPreferences(preferences);

    expect(clonedPreferences).toEqual(preferences);
    expect(clonedPreferences).not.toBe(preferences);
    expect(clonedPreferences.git).not.toBe(preferences.git);
    expect(clonedPreferences.git?.deferredPaths).not.toBe(preferences.git.deferredPaths);
    expect(clonedPreferences.context).not.toBe(preferences.context);
    expect(clonedPreferences.context?.folders).not.toBe(preferences.context.folders);
    expect(clonedPreferences.context?.folders?.[0]).not.toBe(sourceFolder);
  });
});
