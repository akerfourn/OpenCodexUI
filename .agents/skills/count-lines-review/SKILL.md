---
name: count-lines-review
description: Audit tracked text files with the repository's count-lines.py, using .count-cache and bounded batches to identify unusually large files and propose maintainable refactors. Use when asked to inspect file-size outliers, apply a line threshold, or plan cleanup of large source files in this repository.
---

# Count Lines Review

Use the repository-local `count-lines.py` to find unusually large tracked text
files and review them without flooding the context with a complete report.
Treat the line count as a signal for investigation, not as proof that a file
must be split.

## Threshold resolution

Resolve the review threshold before paginating the results. Use this precedence
order, from strongest to weakest:

1. An explicit threshold in the user's request.
2. An explicit threshold in an applicable `AGENTS.md`, whether it comes from
   global instructions, the repository, or a more specific directory. Prefer
   the nearest applicable instruction when values conflict.
3. A soft default centered around 500 lines.

An `AGENTS.md` can state the setting in prose or use a clear declaration such
as:

```text
count-lines-threshold: 600
```

Treat a range such as “keep files below roughly 400–500 lines” as guidance,
not as a precise hard cutoff. If no threshold is explicitly available, use the
default as a review signal: inspect files around the boundary as well as files
above it. A cohesive 520-line file can be a better outcome than a 470-line file
split only to move 50 lines elsewhere.

When a threshold is explicit, use it as the requested cutoff while still
considering cohesion, complexity, and natural extraction boundaries. Do not
refactor solely to get a file below a number. If the review spans directories
with different applicable instructions, resolve the threshold for each scope
and report the source of each decision.

## Workflow

1. Establish the repository root and inspect the worktree before making any
   change.
2. Run one fresh analysis without `--cache` at the beginning of the review:

   ```bash
   ./count-lines.py --count 25
   ```

   If the current directory is not the repository root, invoke the script with
   its absolute path resolved from `git rev-parse --show-toplevel`.
3. Paginate through the cached results in small batches. Use 25 entries per
   page unless the task calls for an even smaller batch:

   ```bash
   ./count-lines.py --cache --skip 0 --count 25
   ./count-lines.py --cache --skip 25 --count 25
   ./count-lines.py --cache --skip 50 --count 25
   ```

4. Paginate until the relevant threshold boundary is covered. For an explicit
   threshold, stop after the first page whose last entry is at or below that
   threshold; results are sorted in descending line count, so later entries
   cannot exceed it. For the soft default, inspect a transition band around
   500 lines (approximately 450–550, adapting to the actual file distribution)
   before stopping. Record the resolved threshold, its source, and the files
   selected for review rather than applying an automatic hard cutoff.
5. Inspect candidate files in bounded sections. Prefer symbol searches and
   focused slices over dumping an entire large file:

   ```bash
   rg -n "^(export )?(class|interface|type|function|const) " path/to/file
   sed -n '1,200p' path/to/file
   sed -n '201,400p' path/to/file
   ```

6. For each candidate, identify responsibilities, public entry points,
   collaborators, tests, and natural extraction boundaries. Distinguish
   generated or declarative content from code that is genuinely difficult to
   maintain.
7. Report a prioritized cleanup proposal before modifying files. Include the
   current line count, the reason the file is large, suggested boundaries,
   dependency/risk notes, and validation tests.
8. If implementation is explicitly requested, refactor one cohesive boundary
   at a time, preserve behavior, run focused tests, and refresh the analysis
   without `--cache` after the changes.

## Cache rules

- Treat `.count-cache` as a complete snapshot, not as a live measurement.
- The cache contains counts only; it does not store the review threshold. The
  threshold must be resolved again for each review, so changing the user or
  `AGENTS.md` guidance does not require regenerating the cache.
- Use `--cache` for pagination after the initial fresh analysis.
- Re-run without `--cache` after source changes or whenever freshness matters;
  `--cache` intentionally trusts the existing file.
- Never commit or manually edit `.count-cache`. It is ignored by Git.
- Redirect an optional excerpt to `.count` only when a local artifact is useful:

  ```bash
  ./count-lines.py --cache --count 25 > .count
  ```

  `.count` is also ignored by Git and is not part of the analysis.

## Command reference

```text
./count-lines.py [-c|--cache] [-n N|--count N] [-s M|--skip M]
```

- Omit `--cache` to regenerate the complete sorted snapshot.
- Add `--cache` to read `.count-cache`, generating it if it does not exist.
- Use `--count N` to print at most `N` entries.
- Use `--skip M` to skip the first `M` entries before applying `--count`.
- Each output line has the form `<repository-relative-path><TAB><line-count>`.

The review report should state the resolved threshold and its source, then list
the selected files with their counts, responsibilities, proposed extraction
boundaries, risks, and validation tests.

Keep the review incremental: discover a bounded page, inspect only the
outliers, and make the smallest justified structural change.
