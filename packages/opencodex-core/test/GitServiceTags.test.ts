/** Covers Git service tag listing and tag mutations. */
import { describe, expect, it } from "vitest";

import {
  createGitService,
  FakeCodexClient
} from "./gitServiceTestUtils";

describe("GitService tags", () => {
  it("should list Git tags with metadata", async () => {
    const client = new FakeCodexClient([
      {
        exitCode: 0,
        stdout: [
          "refs/tags/v1.2.0\tv1.2.0\tabc1234\t2026-05-01T10:00:00+00:00",
          "refs/tags/v1.1.0\tv1.1.0\tdef5678\t2026-04-01T10:00:00+00:00",
          ""
        ].join("\n"),
        stderr: ""
      },
      { exitCode: 0, stdout: "", stderr: "" }
    ]);
    const service = createGitService(client);

    const tags = await service.tags("/workspace/project", "source-1");

    expect(tags).toEqual({
      tags: [
        {
          name: "v1.2.0",
          fullName: "refs/tags/v1.2.0",
          targetHash: "abc1234",
          createdAt: "2026-05-01T10:00:00+00:00",
          remoteTargetHash: null,
          syncStatus: "unknown"
        },
        {
          name: "v1.1.0",
          fullName: "refs/tags/v1.1.0",
          targetHash: "def5678",
          createdAt: "2026-04-01T10:00:00+00:00",
          remoteTargetHash: null,
          syncStatus: "unknown"
        }
      ],
      remoteName: null,
      remoteError: null
    });
    expect(client.commands).toEqual([
      [
        "git",
        "for-each-ref",
        "--sort=-creatordate",
        "--format=%(refname)%09%(refname:short)%09%(objectname)%09%(creatordate:iso-strict)",
        "refs/tags"
      ],
      ["git", "remote"]
    ]);
  });

  it("should create lightweight tags and refresh the tag list", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
      {
        exitCode: 0,
        stdout: "refs/tags/v1.2.1\tv1.2.1\tabc1234\t2026-05-02T10:00:00+00:00\n",
        stderr: ""
      },
      { exitCode: 0, stdout: "", stderr: "" }
    ]);
    const service = createGitService(client);

    const tags = await service.createTag("/workspace/project", "source-1", "v1.2.1");

    expect(tags.tags[0]?.name).toBe("v1.2.1");
    expect(client.commands).toEqual([
      ["git", "check-ref-format", "refs/tags/v1.2.1"],
      ["git", "tag", "v1.2.1"],
      [
        "git",
        "for-each-ref",
        "--sort=-creatordate",
        "--format=%(refname)%09%(refname:short)%09%(objectname)%09%(creatordate:iso-strict)",
        "refs/tags"
      ],
      ["git", "remote"]
    ]);
  });

  it("should classify local tags against the configured remote", async () => {
    const syncedHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const divergedLocalHash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const divergedRemoteHash = "cccccccccccccccccccccccccccccccccccccccc";
    const localOnlyHash = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    const client = new FakeCodexClient([
      {
        exitCode: 0,
        stdout: [
          `refs/tags/v1.3.0\tv1.3.0\t${syncedHash}\t2026-05-03T10:00:00+00:00`,
          `refs/tags/v1.2.0\tv1.2.0\t${divergedLocalHash}\t2026-05-02T10:00:00+00:00`,
          `refs/tags/v1.1.0\tv1.1.0\t${localOnlyHash}\t2026-05-01T10:00:00+00:00`,
          ""
        ].join("\n"),
        stderr: ""
      },
      { exitCode: 0, stdout: "origin\n", stderr: "" },
      {
        exitCode: 0,
        stdout: [
          `${syncedHash}\trefs/tags/v1.3.0`,
          `${divergedRemoteHash}\trefs/tags/v1.2.0`,
          ""
        ].join("\n"),
        stderr: ""
      }
    ]);
    const service = createGitService(client);

    const result = await service.tags("/workspace/project", "source-1");

    expect(result.remoteName).toBe("origin");
    expect(result.remoteError).toBeNull();
    expect(result.tags).toEqual([
      expect.objectContaining({
        name: "v1.3.0",
        targetHash: syncedHash,
        remoteTargetHash: syncedHash,
        syncStatus: "synced"
      }),
      expect.objectContaining({
        name: "v1.2.0",
        targetHash: divergedLocalHash,
        remoteTargetHash: divergedRemoteHash,
        syncStatus: "diverged"
      }),
      expect.objectContaining({
        name: "v1.1.0",
        targetHash: localOnlyHash,
        remoteTargetHash: null,
        syncStatus: "local-only"
      })
    ]);
    expect(client.commands).toEqual([
      [
        "git",
        "for-each-ref",
        "--sort=-creatordate",
        "--format=%(refname)%09%(refname:short)%09%(objectname)%09%(creatordate:iso-strict)",
        "refs/tags"
      ],
      ["git", "remote"],
      ["git", "ls-remote", "--tags", "--refs", "origin"]
    ]);
  });

  it("should push one tag without force and refresh synchronization state", async () => {
    const tagHash = "dddddddddddddddddddddddddddddddddddddddd";
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "origin\n", stderr: "" },
      { exitCode: 0, stdout: "Everything up-to-date\n", stderr: "" },
      {
        exitCode: 0,
        stdout: `refs/tags/v1.4.0\tv1.4.0\t${tagHash}\t2026-05-04T10:00:00+00:00\n`,
        stderr: ""
      },
      { exitCode: 0, stdout: "origin\n", stderr: "" },
      { exitCode: 0, stdout: `${tagHash}\trefs/tags/v1.4.0\n`, stderr: "" }
    ]);
    const service = createGitService(client);

    const result = await service.pushTag("/workspace/project", "source-1", "v1.4.0", false);

    expect(result.tags[0]).toEqual(expect.objectContaining({
      name: "v1.4.0",
      syncStatus: "synced",
      remoteTargetHash: tagHash
    }));
    expect(client.commands).toEqual([
      ["git", "check-ref-format", "refs/tags/v1.4.0"],
      ["git", "remote"],
      ["git", "push", "origin", "refs/tags/v1.4.0"],
      [
        "git",
        "for-each-ref",
        "--sort=-creatordate",
        "--format=%(refname)%09%(refname:short)%09%(objectname)%09%(creatordate:iso-strict)",
        "refs/tags"
      ],
      ["git", "remote"],
      ["git", "ls-remote", "--tags", "--refs", "origin"]
    ]);
  });

  it("should use a forced tag refspec only for explicit force pushes", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "origin\n", stderr: "" },
      { exitCode: 0, stdout: "forced\n", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "origin\n", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" }
    ]);
    const service = createGitService(client);

    await service.pushTag("/workspace/project", "source-1", "v1.4.1", true);

    expect(client.commands).toEqual([
      ["git", "check-ref-format", "refs/tags/v1.4.1"],
      ["git", "remote"],
      ["git", "push", "--force", "origin", "refs/tags/v1.4.1"],
      [
        "git",
        "for-each-ref",
        "--sort=-creatordate",
        "--format=%(refname)%09%(refname:short)%09%(objectname)%09%(creatordate:iso-strict)",
        "refs/tags"
      ],
      ["git", "remote"],
      ["git", "ls-remote", "--tags", "--refs", "origin"]
    ]);
  });

  it("should push all local tags without force", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "origin\n", stderr: "" },
      { exitCode: 0, stdout: "pushed\n", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "origin\n", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" }
    ]);
    const service = createGitService(client);

    await service.pushTags("/workspace/project", "source-1");

    expect(client.commands).toEqual([
      ["git", "remote"],
      ["git", "push", "origin", "--tags"],
      [
        "git",
        "for-each-ref",
        "--sort=-creatordate",
        "--format=%(refname)%09%(refname:short)%09%(objectname)%09%(creatordate:iso-strict)",
        "refs/tags"
      ],
      ["git", "remote"],
      ["git", "ls-remote", "--tags", "--refs", "origin"]
    ]);
  });
});
