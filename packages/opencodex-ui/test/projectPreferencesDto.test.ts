/**
 * Covers project preference DTO conversion before UI/backend transport.
 */
import { describe, expect, it } from "vitest";
import { observable, isObservable } from "mobx";

import { cloneProjectPreferences } from "../src/stores/project/projectPreferencesDto";

describe("project preferences DTO", () => {
  it("should retain the disabled policy when cloning observable preferences for another settings update", () => {
    const preferences = observable({ workspaceRetention: { days: null }, workspacePreparation: { commandId: "prepare" } });
    const cloned = cloneProjectPreferences(preferences);
    expect(isObservable(cloned.workspaceRetention)).toBe(false);
    expect(structuredClone(cloned)).toEqual({ workspaceRetention: { days: null }, workspacePreparation: { commandId: "prepare" } });
  });

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
      workspaceRetention: { days: null },
      workspacePreparation: { commandId: "prepare" },
      git: {
        referenceTagName: "v1.0.0",
        deferredPaths: ["src/experimental.ts"],
        commitProtectedBranches: ["dev", "main"]
      },
      context: {
        permissionsProfileId: "opencodex-context",
        accessScope: "local",
        folders: [sourceFolder],
        lastSyncedAt: "2026-06-27T10:00:00.000Z"
      }
    };

    const clonedPreferences = cloneProjectPreferences(preferences);

    expect(clonedPreferences).toEqual(preferences);
    expect(clonedPreferences).not.toBe(preferences);
    expect(clonedPreferences.workspaceRetention).not.toBe(preferences.workspaceRetention);
    expect(clonedPreferences.workspacePreparation).not.toBe(preferences.workspacePreparation);
    expect(clonedPreferences.git).not.toBe(preferences.git);
    expect(clonedPreferences.git?.deferredPaths).not.toBe(preferences.git.deferredPaths);
    expect(clonedPreferences.git?.commitProtectedBranches)
      .not.toBe(preferences.git.commitProtectedBranches);
    expect(clonedPreferences.context).not.toBe(preferences.context);
    expect(clonedPreferences.context?.folders).not.toBe(preferences.context.folders);
    expect(clonedPreferences.context?.folders?.[0]).not.toBe(sourceFolder);
  });
});
