/** Source-native worktree metadata; this does not establish application ownership. */
export interface GitWorktree {
  /** Path emitted by Git, preserved without host normalization. */
  path: string;
  /** Full object id, absent for a bare repository entry. */
  head: string | null;
  /** Full local branch reference, absent for detached/bare entries. */
  branch: string | null;
  /** Whether this entry represents a bare repository. */
  bare: boolean;
  /** Whether HEAD is detached. */
  detached: boolean;
  /** Null means unlocked; an empty string is a lock without a reason. */
  lockedReason: string | null;
  /** Null means not prunable; an empty string is an unspecified reason. */
  prunableReason: string | null;
}

/** Parses porcelain -z records without splitting or unquoting source paths. */
export function parseGitWorktrees(output: string): GitWorktree[] {
  if (output === "") {
    return [];
  }
  if (!output.endsWith("\0\0")) {
    throw new Error("Incomplete Git worktree listing.");
  }
  const entries: GitWorktree[] = [];
  for (const record of output.slice(0, -2).split("\0\0")) {
    const fields = record.split("\0");
    const first = fields.shift() ?? "";
    if (!first.startsWith("worktree ") || first.length === 9) {
      throw new Error("Git worktree record has no path.");
    }
    const entry: GitWorktree = {
      path: first.slice(9), head: null, branch: null, bare: false,
      detached: false, lockedReason: null, prunableReason: null
    };
    const seen = new Set<string>();
    for (const field of fields) {
      const separator = field.indexOf(" ");
      const key = separator === -1 ? field : field.slice(0, separator);
      const value = separator === -1 ? "" : field.slice(separator + 1);
      if (seen.has(key)) {
        throw new Error(`Duplicate Git worktree field: ${key}.`);
      }
      seen.add(key);
      switch (key) {
        case "HEAD": entry.head = value; break;
        case "branch": entry.branch = value; break;
        case "bare": entry.bare = true; break;
        case "detached": entry.detached = true; break;
        case "locked": entry.lockedReason = value; break;
        case "prunable": entry.prunableReason = value; break;
        default: throw new Error(`Unsupported Git worktree field: ${key}.`);
      }
    }
    if (!entry.bare && (entry.head === null || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(entry.head)
      || (entry.branch === null && !entry.detached))) {
      throw new Error("Git worktree record has incomplete HEAD metadata.");
    }
    if ((entry.detached && entry.branch !== null) || (entry.bare && (entry.head !== null || entry.branch !== null))) {
      throw new Error("Git worktree record has contradictory HEAD metadata.");
    }
    entries.push(entry);
  }
  return entries;
}
