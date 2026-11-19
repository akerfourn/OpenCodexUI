import type { OpenCodexWorkspaceRemovalFile } from "@open-codex-ui/opencodex-protocol";

/** Parses complete porcelain v1 -z records, preserving literal filenames and consuming rename origins. */
export function parseWorkspaceRemovalFiles(output: string): OpenCodexWorkspaceRemovalFile[] {
  if (output === "") return [];
  if (!output.endsWith("\0")) throw new Error("Incomplete Git removal file inventory.");
  const records = output.slice(0, -1).split("\0");
  const files: OpenCodexWorkspaceRemovalFile[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    if (!/^[ MADRCUT?!]{2} .+/su.test(record)) throw new Error("Unsupported Git removal file record.");
    const status = record.slice(0, 2);
    let kind: OpenCodexWorkspaceRemovalFile["kind"] = "tracked";
    if (status === "??") kind = "untracked";
    else if (status === "!!") kind = "ignored";
    files.push({ path: record.slice(3), kind });
    if (status.includes("R") || status.includes("C")) {
      index += 1;
      if (records[index] === undefined || records[index] === "") throw new Error("Incomplete Git removal rename record.");
    }
  }
  return files;
}
