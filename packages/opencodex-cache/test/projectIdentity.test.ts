/**
 * Verifies how project identities are derived from POSIX and Windows paths.
 */
import { describe, expect, it } from "vitest";

import { createProjectIdentity } from "../src/projectIdentity";

describe("project identity", () => {
  it("should derive the default project name from the path basename", () => {
    expect(createProjectIdentity("/home/adrien/Projets/Perso/OpenCodexUI")).toMatchObject({
      path: "/home/adrien/Projets/Perso/OpenCodexUI",
      defaultName: "OpenCodexUI"
    });
  });

  it("should support Windows-style paths", () => {
    expect(createProjectIdentity("C:\\Users\\adrien\\OpenCodexUI")).toMatchObject({
      path: "C:\\Users\\adrien\\OpenCodexUI",
      defaultName: "OpenCodexUI"
    });
  });
});
