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

  it("should scope the project id by source", () => {
    const localProject = createProjectIdentity("/workspace/project", "source-local");
    const remoteProject = createProjectIdentity("/workspace/project", "source-ssh");

    expect(localProject?.id).not.toBe(remoteProject?.id);
    expect(localProject).toMatchObject({
      sourceKey: "source-local",
      path: "/workspace/project"
    });
    expect(remoteProject).toMatchObject({
      sourceKey: "source-ssh",
      path: "/workspace/project"
    });
  });
});
