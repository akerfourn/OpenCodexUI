#!/usr/bin/env python3
"""List tracked text files ordered by their number of lines.

The analysis is based on the files currently tracked by Git. A complete,
sorted result is stored in ``.count-cache`` and can be reused with
``--cache``. The selected entries are written to standard output so callers
can save them in the ignored ``.count`` file when needed.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import subprocess
import sys


# These files are generated locally and must never participate in their own
# analysis or in the cached result.
CACHE_FILENAME = ".count-cache"
IGNORED_RESULT_FILES = {".count", CACHE_FILENAME}

# Package manifests are generated or maintained by the package manager rather
# than representing application source code.
IGNORED_FILENAMES = {"package.json", "package-lock.json"}
IGNORED_PATH_PREFIXES = ("packages/codex-rpc/src/generated/",)

# Read a small prefix to classify files, then process text files in chunks so
# large source files do not need to be loaded entirely into memory.
CHUNK_SIZE = 1024 * 1024
TEXT_SAMPLE_SIZE = 8192


def parse_non_negative_integer(value: str) -> int:
    """Parse a non-negative command-line integer.

    Args:
        value: Raw value supplied to an integer command-line option.

    Returns:
        Parsed non-negative integer.

    Raises:
        argparse.ArgumentTypeError: If ``value`` is not a non-negative integer.
    """
    try:
        parsed = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError(f"invalid integer: {value}") from error

    if parsed < 0:
        raise argparse.ArgumentTypeError("value must be non-negative")

    return parsed


def find_repository_root() -> Path:
    """Resolve the Git repository root from the current working directory.

    Returns:
        Absolute path to the repository root.

    Raises:
        subprocess.CalledProcessError: If the current directory is not inside
            a Git repository or Git cannot resolve the root.
    """
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        check=True,
        capture_output=True,
        text=True,
    )
    return Path(result.stdout.strip())


def read_tracked_paths(repository_root: Path) -> list[str]:
    """Read eligible tracked paths from Git.

    Args:
        repository_root: Repository in which Git should list tracked files.

    Returns:
        Relative Git paths that are not excluded by the analysis rules.

    Raises:
        subprocess.CalledProcessError: If Git cannot list tracked files.
    """
    result = subprocess.run(
        ["git", "ls-files", "-z"],
        check=True,
        capture_output=True,
        cwd=repository_root,
    )
    paths: list[str] = []

    # NUL-delimited output keeps spaces, tabs, and newlines in file names safe.
    for raw_path in result.stdout.split(b"\0"):
        if not raw_path:
            continue

        relative_path = os.fsdecode(raw_path)
        if not should_ignore_path(relative_path):
            paths.append(relative_path)

    return paths


def should_ignore_path(relative_path: str) -> bool:
    """Check whether a tracked path is excluded from the analysis.

    Args:
        relative_path: Git-formatted path relative to the repository root.

    Returns:
        ``True`` for generated result files, package manifests, or generated
        RPC sources; otherwise ``False``.
    """
    return (
        relative_path in IGNORED_RESULT_FILES or
        Path(relative_path).name in IGNORED_FILENAMES or
        any(relative_path.startswith(prefix) for prefix in IGNORED_PATH_PREFIXES)
    )


def is_text_sample(sample: bytes) -> bool:
    """Classify a byte sample as likely UTF-8 text or binary data.

    Args:
        sample: Initial bytes read from a tracked file.

    Returns:
        ``True`` when the sample contains printable text and valid UTF-8 (or
        only ends with an incomplete UTF-8 sequence); otherwise ``False``.
    """
    if not sample:
        return True

    if any(
        (byte < 32 and byte not in {9, 10, 12, 13}) or byte == 127
        for byte in sample
    ):
        return False

    try:
        sample.decode("utf-8")
    except UnicodeDecodeError as error:
        # A sample may end in the middle of a UTF-8 sequence, which is not
        # evidence that the complete file is binary.
        return error.reason == "unexpected end of data" and error.start >= len(sample) - 4

    return True


def count_file_lines(path: Path) -> int | None:
    """Count newline-delimited lines in a text file.

    Args:
        path: Working-tree file to inspect.

    Returns:
        Number of newline characters, matching ``wc -l`` semantics, or
        ``None`` when the initial sample identifies binary content.

    Raises:
        OSError: If the file cannot be opened or read.
    """

    with path.open("rb") as file_handle:
        first_chunk = file_handle.read(TEXT_SAMPLE_SIZE)

        if not is_text_sample(first_chunk):
            return None

        line_count = first_chunk.count(b"\n")

        while chunk := file_handle.read(CHUNK_SIZE):
            line_count += chunk.count(b"\n")

    return line_count


def calculate_counts(repository_root: Path) -> list[tuple[str, int]]:
    """Calculate and sort line counts for eligible tracked files.

    Args:
        repository_root: Repository whose working-tree files are inspected.

    Returns:
        Entries sorted by descending line count and then ascending path.

    Side effects:
        Missing tracked files are reported to standard error and skipped.
    """
    counts: list[tuple[str, int]] = []

    for relative_path in read_tracked_paths(repository_root):
        path = repository_root / relative_path

        if not path.is_file():
            print(f"Skipping unavailable tracked file: {relative_path}", file=sys.stderr)
            continue

        line_count = count_file_lines(path)

        if line_count is not None:
            counts.append((relative_path, line_count))

    return sorted(counts, key=lambda entry: (-entry[1], entry[0]))


def read_cache(cache_path: Path) -> list[tuple[str, int]]:
    """Read and validate a previously generated count cache.

    Args:
        cache_path: Cache file containing ``path<TAB>line-count`` entries.

    Returns:
        Cached path/count entries in the order stored in the file.

    Raises:
        OSError: If the cache cannot be read.
        ValueError: If an entry is malformed or has a negative count.
    """
    counts: list[tuple[str, int]] = []

    for line_number, line in enumerate(cache_path.read_text(encoding="utf-8").splitlines(), 1):
        if not line:
            continue

        try:
            relative_path, raw_count = line.rsplit("\t", 1)
            line_count = int(raw_count)
        except ValueError as error:
            raise ValueError(f"invalid cache entry on line {line_number}") from error

        if not relative_path or line_count < 0:
            raise ValueError(f"invalid cache entry on line {line_number}")

        counts.append((relative_path, line_count))

    return counts


def write_cache(cache_path: Path, counts: list[tuple[str, int]]) -> None:
    """Write the complete sorted analysis to a cache file.

    Args:
        cache_path: Destination cache file, normally ``.count-cache``.
        counts: Complete sorted analysis to persist.

    Raises:
        OSError: If the cache cannot be written.
    """
    content = "".join(f"{relative_path}\t{line_count}\n" for relative_path, line_count in counts)
    cache_path.write_text(content, encoding="utf-8")


def build_argument_parser() -> argparse.ArgumentParser:
    """Build the command-line argument parser.

    Returns:
        Configured parser for cache, skip, and count options.
    """
    parser = argparse.ArgumentParser(
        description="List tracked files ordered by descending line count."
    )
    parser.add_argument(
        "-c",
        "--cache",
        action="store_true",
        help=f"use {CACHE_FILENAME} when it exists; otherwise generate it",
    )
    parser.add_argument(
        "-n",
        "--count",
        type=parse_non_negative_integer,
        default=None,
        metavar="N",
        help="print at most N entries (default: all entries)",
    )
    parser.add_argument(
        "-s",
        "--skip",
        type=parse_non_negative_integer,
        default=0,
        metavar="M",
        help="skip the first M entries",
    )
    return parser


def main() -> int:
    """Run the analysis or cache lookup and print selected entries.

    Returns:
        Process exit code: ``0`` on success and ``1`` for repository, file, or
        cache errors.

    Side effects:
        Reads tracked working-tree files, optionally rewrites ``.count-cache``,
        and writes selected results to standard output.
    """
    arguments = build_argument_parser().parse_args()

    try:
        repository_root = find_repository_root()
        cache_path = repository_root / CACHE_FILENAME

        if arguments.cache and cache_path.exists():
            counts = read_cache(cache_path)
        else:
            counts = calculate_counts(repository_root)
            write_cache(cache_path, counts)

        selected_counts = counts[arguments.skip:]
        if arguments.count is not None:
            selected_counts = selected_counts[:arguments.count]

        for relative_path, line_count in selected_counts:
            print(f"{relative_path}\t{line_count}")
    except (OSError, subprocess.CalledProcessError, ValueError) as error:
        print(f"count-lines: {error}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
