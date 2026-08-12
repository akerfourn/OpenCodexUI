/** Covers Git service remote listing and configuration. */
import { describe, expect, it } from "vitest";

import {
  createGitService,
  FakeCodexClient
} from "./gitServiceTestUtils";

describe("GitService remotes", () => {
  it("should list configured remotes with fetch and push URLs", async () => {
    const client = new FakeCodexClient([
      {
        exitCode: 0,
        stdout: [
          "origin\tgit@example.com:owner/repo.git (fetch)",
          "origin\tgit@example.com:owner/repo.git (push)",
          "backup\tssh://backup.example.com/repo.git (fetch)",
          ""
        ].join("\n"),
        stderr: ""
      }
    ]);
    const service = createGitService(client);

    const remotes = await service.remotes("/workspace/project", "source-1");

    expect(remotes).toEqual([
      {
        name: "backup",
        fetchUrl: "ssh://backup.example.com/repo.git",
        pushUrl: null
      },
      {
        name: "origin",
        fetchUrl: "git@example.com:owner/repo.git",
        pushUrl: "git@example.com:owner/repo.git"
      }
    ]);
    expect(client.commands).toEqual([
      ["git", "remote", "-v"]
    ]);
  });

  it("should add missing remotes before refreshing status", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "true\n", stderr: "" },
      { exitCode: 0, stdout: "# branch.head main\0", stderr: "" },
      { exitCode: 0, stdout: "origin\tgit@example.com:owner/repo.git (fetch)\n", stderr: "" }
    ]);
    const service = createGitService(client);

    const status = await service.upsertRemote(
      "/workspace/project",
      "source-1",
      "origin",
      "git@example.com:owner/repo.git"
    );

    expect(status.remotes).toEqual([
      {
        name: "origin",
        fetchUrl: "git@example.com:owner/repo.git",
        pushUrl: null
      }
    ]);
    expect(client.commands).toEqual([
      ["git", "remote", "-v"],
      ["git", "remote", "add", "origin", "git@example.com:owner/repo.git"],
      ["git", "rev-parse", "--is-inside-work-tree"],
      ["git", "status", "--porcelain=v2", "-z", "--branch"],
      ["git", "remote", "-v"]
    ]);
  });
});
