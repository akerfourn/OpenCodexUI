import { describe, expect, it } from "vitest";
import { parseProjectPreferences, serializeProjectPreferences } from "../src/sqlite/projects/projectPreferences";

describe("workspace retention preferences", () => {
  it("should leave legacy preferences absent so the UI can use its default", () => {
    expect(parseProjectPreferences("{}").workspaceRetention).toBeUndefined();
    expect(serializeProjectPreferences({})).toBeNull();
  });

  it.each([1, 30, 3650, null])("should preserve valid retention values: %s", days => {
    expect(parseProjectPreferences(JSON.stringify({ workspaceRetention: { days } })).workspaceRetention).toEqual({ days });
  });

  it.each([null, [], {}, { days: "30" }, { days: 0 }, { days: -1 }, { days: 1.5 }, { days: 3651 }])(
    "should disable suggestions for a malformed stored policy: %s", workspaceRetention => {
      expect(parseProjectPreferences(JSON.stringify({ workspaceRetention })).workspaceRetention).toEqual({ days: null });
    });
});
