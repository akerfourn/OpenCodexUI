import { describe, expect, it } from "vitest";

import { createGitService, FakeCodexClient } from "./gitServiceTestUtils";

describe("GitService file diffs", () => {
  it("should compare the index with the working tree", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "2\t1\tfile.txt\0", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "indexed version\n", stderr: "" }
    ]);
    const service = createGitService(client);

    const diff = await service.fileDiff(
      "/workspace/project",
      "source-1",
      "file.txt",
      "workingTree"
    );

    expect(diff).toEqual({
      originalContent: "indexed version\n",
      modifiedContent: null,
      issue: null
    });
    expect(client.commands).toEqual([
      ["git", "diff", "--no-ext-diff", "--no-textconv", "--numstat", "-z", "--", "file.txt"],
      ["git", "cat-file", "-e", ":./file.txt"],
      ["git", "show", ":./file.txt"]
    ]);
  });

  it("should compare HEAD with the index for staged files", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "1\t0\tfile.txt\0", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "HEAD version\n", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "staged version\n", stderr: "" }
    ]);
    const service = createGitService(client);

    const diff = await service.fileDiff("/workspace/project", "source-1", "file.txt", "staged");

    expect(diff).toEqual({
      originalContent: "HEAD version\n",
      modifiedContent: "staged version\n",
      issue: null
    });
    expect(client.commands).toEqual([
      ["git", "diff", "--no-ext-diff", "--no-textconv", "--numstat", "-z", "--cached", "--", "file.txt"],
      ["git", "cat-file", "-e", "HEAD:./file.txt"],
      ["git", "show", "HEAD:./file.txt"],
      ["git", "cat-file", "-e", ":./file.txt"],
      ["git", "show", ":./file.txt"]
    ]);
  });

  it("should reject paths outside the repository without running Git", async () => {
    const client = new FakeCodexClient([]);
    const service = createGitService(client);

    await expect(
      service.fileDiff("/workspace/project", "source-1", "../secret.txt", "workingTree")
    ).rejects.toThrow("repository-relative");
    expect(client.commands).toEqual([]);
  });

  it("should report binary changes without loading their blobs", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "-\t-\timage.png\0", stderr: "" }
    ]);
    const service = createGitService(client);

    const diff = await service.fileDiff(
      "/workspace/project",
      "source-1",
      "image.png",
      "staged"
    );

    expect(diff).toEqual({ originalContent: "", modifiedContent: null, issue: "binary" });
    expect(client.commands).toHaveLength(1);
  });
});
