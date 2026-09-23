import type {
  OpenCodexGitDiffComparison,
  OpenCodexGitFileDiff
} from "@open-codex-ui/opencodex-protocol";

import type { RunGit } from "./gitCommandRunner.js";

const MAX_DIFF_FILE_BYTES = 2 * 1024 * 1024;
const GIT_OUTPUT_BYTES_CAP = MAX_DIFF_FILE_BYTES + 64 * 1024;

/** Dependencies required to read Git blobs for the integrated diff viewer. */
export type GitFileDiffContext = {
  runGit: RunGit;
};

/** Reads the immutable Git side or sides for one source-relative file. */
export async function readGitFileDiff(
  context: GitFileDiffContext,
  projectPath: string,
  sourceId: string | null,
  path: string,
  comparison: OpenCodexGitDiffComparison
): Promise<OpenCodexGitFileDiff> {
  if (comparison !== "workingTree" && comparison !== "staged") {
    throw new Error("Git diff comparison must target the working tree or staged index.");
  }
  const filePath = normalizeGitFilePath(path);
  const issue = await readTextIssue(context, projectPath, sourceId, filePath, comparison);

  if (issue !== null) {
    return { originalContent: "", modifiedContent: null, issue };
  }

  const originalReference = comparison === "staged"
    ? `HEAD:./${filePath}`
    : `:./${filePath}`;
  const original = await readOptionalGitText(
    context,
    projectPath,
    sourceId,
    originalReference
  );
  if (original.tooLarge) {
    return { originalContent: "", modifiedContent: null, issue: "tooLarge" };
  }

  if (comparison === "workingTree") {
    return { originalContent: original.content, modifiedContent: null, issue: null };
  }

  const modified = await readOptionalGitText(
    context,
    projectPath,
    sourceId,
    `:./${filePath}`
  );
  if (modified.tooLarge) {
    return { originalContent: "", modifiedContent: null, issue: "tooLarge" };
  }

  return { originalContent: original.content, modifiedContent: modified.content, issue: null };
}

/** Rejects paths that could escape the repository or change Git revision syntax. */
function normalizeGitFilePath(path: string): string {
  const segments = path.split("/");
  if (
    path.trim().length === 0 ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.startsWith("/") ||
    segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error("Git diff requires a normalized repository-relative file path.");
  }

  return path;
}

/** Checks Git's text diff summary before fetching potentially binary blobs. */
async function readTextIssue(
  context: GitFileDiffContext,
  projectPath: string,
  sourceId: string | null,
  path: string,
  comparison: OpenCodexGitDiffComparison
): Promise<OpenCodexGitFileDiff["issue"]> {
  const args = ["diff", "--no-ext-diff", "--no-textconv", "--numstat", "-z"];
  if (comparison === "staged") args.push("--cached");
  args.push("--", path);
  const result = await context.runGit(projectPath, sourceId, args);

  if (result.stdout.split("\0").some((entry) => entry.startsWith("-\t-\t"))) {
    return "binary";
  }

  return result.stdoutCapReached ? "tooLarge" : null;
}

/** Reads a Git object as UTF-8, treating an absent tree/index path as empty. */
async function readOptionalGitText(
  context: GitFileDiffContext,
  projectPath: string,
  sourceId: string | null,
  reference: string
): Promise<{ content: string; tooLarge: boolean }> {
  const exists = await context.runGit(
    projectPath,
    sourceId,
    ["cat-file", "-e", reference],
    { allowFailure: true }
  );
  if (exists.exitCode !== 0) return { content: "", tooLarge: false };

  const result = await context.runGit(projectPath, sourceId, ["show", reference], {
    outputBytesCap: GIT_OUTPUT_BYTES_CAP
  });
  return {
    content: result.stdout,
    tooLarge: result.stdoutCapReached || isTooLarge(result.stdout)
  };
}

/** Checks a Git blob's UTF-8 byte length against the file-viewer limit. */
function isTooLarge(content: string): boolean {
  return Buffer.byteLength(content, "utf8") > MAX_DIFF_FILE_BYTES;
}
