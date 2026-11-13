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
      ["git", "remote", "add", "--", "origin", "git@example.com:owner/repo.git"],
      ["git", "rev-parse", "--is-inside-work-tree"],
      ["git", "status", "--porcelain=v2", "-z", "--branch"],
      ["git", "remote", "-v"]
    ]);
  });

  it("should reject duplicate additions rather than replacing an existing remote", async () => {
    const client = new FakeCodexClient([{
      exitCode: 0, stdout: "origin\thttps://example.test/old.git (fetch)\n", stderr: ""
    }]);
    const service = createGitService(client);
    await expect(service.upsertRemote("/project", "source-1", "origin", "https://example.test/new.git", "add"))
      .rejects.toThrow('Git remote "origin" already exists.');
    expect(client.commands).toEqual([["git", "remote", "-v"]]);
  });

  it("should reject editing a removed remote rather than silently recreating it", async () => {
    const client = new FakeCodexClient([{ exitCode: 0, stdout: "", stderr: "" }]);
    const service = createGitService(client);
    await expect(service.upsertRemote("/project", "source-1", "origin", "https://example.test/new.git", "update"))
      .rejects.toThrow('Git remote "origin" no longer exists.');
    expect(client.commands).toEqual([["git", "remote", "-v"]]);
  });

  it("should update only the selected fetch URL and preserve separate push configuration", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "backup\t/old.git (fetch)\nbackup\t/push.git (push)\n", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "true\n", stderr: "" },
      { exitCode: 0, stdout: "# branch.head main\0", stderr: "" },
      { exitCode: 0, stdout: "backup\t/new.git (fetch)\nbackup\t/push.git (push)\n", stderr: "" }
    ]);
    const status = await createGitService(client).upsertRemote("/project", "source-1", "backup", "/new.git", "update");
    expect(client.commands[1]).toEqual(["git", "remote", "set-url", "--", "backup", "/new.git"]);
    expect(status.remotes).toEqual([{ name: "backup", fetchUrl: "/new.git", pushUrl: "/push.git" }]);
  });

  it("should remove only the named remote and return the remaining configuration", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "true\n", stderr: "" },
      { exitCode: 0, stdout: "# branch.head main\0", stderr: "" },
      { exitCode: 0, stdout: "origin\t/origin.git (fetch)\n", stderr: "" }
    ]);
    const status = await createGitService(client).removeRemote("/project", "source-1", " backup ");
    expect(client.commands[0]).toEqual(["git", "remote", "remove", "--", "backup"]);
    expect(status.remotes.map((remote) => remote.name)).toEqual(["origin"]);
  });

  it("should propagate failed removals without reporting a successful refresh", async () => {
    const client = new FakeCodexClient([{ exitCode: 2, stdout: "", stderr: "No such remote: backup" }]);
    await expect(createGitService(client).removeRemote("/project", "source-1", "backup"))
      .rejects.toThrow("No such remote: backup");
    expect(client.commands).toEqual([["git", "remote", "remove", "--", "backup"]]);
  });

  it("should reject an empty removal name before issuing a Git command", async () => {
    const client = new FakeCodexClient([]);
    await expect(createGitService(client).removeRemote("/project", "source-1", " "))
      .rejects.toThrow("Remote name is required.");
    expect(client.commands).toEqual([]);
  });
});
