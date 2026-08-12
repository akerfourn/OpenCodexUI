/** Covers Git service commit count, log pagination, and commit details. */
import { describe, expect, it } from "vitest";

import {
  createGitService,
  FakeCodexClient
} from "./gitServiceTestUtils";

describe("GitService history", () => {
  it("should count commits since a tag", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "7\n", stderr: "" }
    ]);
    const service = createGitService(client);

    const count = await service.commitsSinceTag("/workspace/project", "source-1", "v1.2.0");

    expect(count).toBe(7);
    expect(client.commands).toEqual([
      ["git", "rev-list", "--count", "v1.2.0..HEAD"]
    ]);
  });

  it("should read a paginated Git log", async () => {
    const client = new FakeCodexClient([
      {
        exitCode: 0,
        stdout: [
          "\x1eabc123456789\tabc1234\tAdrien\ta@example.com\t2026-06-01T10:00:00+00:00\tfirst commit\tHEAD -> main, tag: v1.0.0",
          "\x1edef987654321\tdef9876\tAdrien\ta@example.com\t2026-06-01T09:00:00+00:00\tsecond commit\t"
        ].join(""),
        stderr: ""
      }
    ]);
    const service = createGitService(client);

    const page = await service.log("/workspace/project", "source-1", 1, 2);

    expect(page).toEqual({
      commits: [
        {
          hash: "abc123456789",
          shortHash: "abc1234",
          authorName: "Adrien",
          authorEmail: "a@example.com",
          authoredAt: "2026-06-01T10:00:00+00:00",
          subject: "first commit",
          refs: ["HEAD -> main", "tag: v1.0.0"]
        }
      ],
      hasMore: true
    });
    expect(client.commands).toEqual([
      [
        "git",
        "log",
        "--max-count=2",
        "--skip=2",
        "--date=iso-strict",
        "--format=%x1e%H%x09%h%x09%an%x09%ae%x09%aI%x09%s%x09%D"
      ]
    ]);
  });

  it("should read Git commit details without loading a diff", async () => {
    const client = new FakeCodexClient([
      {
        exitCode: 0,
        stdout: "feat(ui): add history modal\n\nShow recent commits in Git panel.\n",
        stderr: ""
      },
      {
        exitCode: 0,
        stdout: [
          "M\tpackages/opencodex-ui/src/components/projects/ProjectGitPanel.tsx",
          "R100\told/path.ts\tnew/path.ts",
          ""
        ].join("\n"),
        stderr: ""
      }
    ]);
    const service = createGitService(client);

    const details = await service.commitDetails("/workspace/project", "source-1", "abc1234");

    expect(details).toEqual({
      hash: "abc1234",
      message: "feat(ui): add history modal\n\nShow recent commits in Git panel.",
      files: [
        {
          status: "modified",
          path: "packages/opencodex-ui/src/components/projects/ProjectGitPanel.tsx",
          originalPath: null
        },
        {
          status: "renamed",
          path: "new/path.ts",
          originalPath: "old/path.ts"
        }
      ]
    });
    expect(client.commands).toEqual([
      ["git", "show", "-s", "--format=%B", "abc1234"],
      ["git", "show", "--format=", "--name-status", "abc1234"]
    ]);
  });
});
