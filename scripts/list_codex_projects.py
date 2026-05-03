#!/usr/bin/env python3
"""List Codex projects through `codex app-server`."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import Counter
from dataclasses import dataclass
from typing import Any


SOURCE_KINDS = [
    "cli",
    "vscode",
    "exec",
    "appServer",
    "subAgent",
    "subAgentReview",
    "subAgentCompact",
    "subAgentThreadSpawn",
    "subAgentOther",
    "unknown",
]


@dataclass(frozen=True)
class AppServerResponse:
    """Represents a JSON-RPC response returned by `codex app-server`."""

    result: dict[str, Any] | None
    error: dict[str, Any] | None


class CodexAppServer:
    """Wraps a `codex app-server` subprocess with simple JSON-RPC helpers."""

    def __init__(self, command: str) -> None:
        """Start the Codex app-server subprocess.

        Args:
            command: CLI command used to launch Codex.
        """
        self._next_id = 1
        self._process = subprocess.Popen(
            [command, "app-server"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
        )

    def close(self) -> None:
        """Terminate the Codex app-server subprocess if it is still running."""
        if self._process.poll() is not None:
            return

        self._process.terminate()
        try:
            self._process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            self._process.kill()

    def request(self, method: str, params: dict[str, Any] | None = None) -> AppServerResponse:
        """Send a JSON-RPC request and wait for the correlated response.

        Args:
            method: JSON-RPC method name to call.
            params: Optional JSON-RPC parameters.

        Returns:
            Normalized app-server response for the requested method.
        """
        request_id = self._next_id
        self._next_id += 1
        payload: dict[str, Any] = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
        }

        if params is not None:
            payload["params"] = params

        self._write(payload)

        while True:
            message = self._read_message()

            if message.get("id") != request_id:
                continue

            result = message.get("result")
            error = message.get("error")
            return AppServerResponse(
                result=result if isinstance(result, dict) else None,
                error=error if isinstance(error, dict) else None,
            )

    def notify(self, method: str, params: dict[str, Any] | None = None) -> None:
        """Send a JSON-RPC notification without waiting for a response.

        Args:
            method: JSON-RPC method name to call.
            params: Optional JSON-RPC parameters.
        """
        payload: dict[str, Any] = {
            "jsonrpc": "2.0",
            "method": method,
        }

        if params is not None:
            payload["params"] = params

        self._write(payload)

    def _write(self, payload: dict[str, Any]) -> None:
        """Write a JSON-RPC payload to the app-server stdin.

        Args:
            payload: JSON-RPC payload to serialize and send.
        """
        if self._process.stdin is None:
            raise RuntimeError("codex app-server stdin is closed")

        self._process.stdin.write(json.dumps(payload, separators=(",", ":")) + "\n")
        self._process.stdin.flush()

    def _read_message(self) -> dict[str, Any]:
        """Read the next JSON-RPC message from the app-server stdout.

        Returns:
            Parsed JSON-RPC message object.
        """
        if self._process.stdout is None:
            raise RuntimeError("codex app-server stdout is closed")

        line = self._process.stdout.readline()

        if line == "":
            stderr = self._process.stderr.read() if self._process.stderr is not None else ""
            raise RuntimeError(f"codex app-server stopped before responding\n{stderr}")

        message = json.loads(line)

        if not isinstance(message, dict):
            raise RuntimeError(f"unexpected JSON-RPC payload: {message!r}")

        return message


def main() -> int:
    """Run the CLI entrypoint.

    Returns:
        Process exit code.
    """
    args = parse_args()
    server = CodexAppServer(args.codex_command)

    try:
        initialize(server)
        threads = list_threads(server, args)
        print_projects(threads, args.show_threads)
    finally:
        server.close()

    return 0


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for the project-list helper.

    Returns:
        Parsed command-line arguments.
    """
    parser = argparse.ArgumentParser(
        description="List Codex projects through codex app-server thread/list."
    )
    parser.add_argument("--codex-command", default="codex")
    parser.add_argument("--page-size", type=int, default=100)
    parser.add_argument("--max-pages", type=int, default=20)
    parser.add_argument("--search", default=None)
    parser.add_argument("--cwd", default=None)
    parser.add_argument("--show-threads", action="store_true")
    return parser.parse_args()


def initialize(server: CodexAppServer) -> None:
    """Run the JSON-RPC initialization handshake expected by Codex.

    Args:
        server: Running Codex app-server wrapper.
    """
    response = server.request(
        "initialize",
        {
            "clientInfo": {
                "name": "opencodexui-debug-project-list",
                "version": "0.0.0",
            },
            "capabilities": {
                "experimentalApi": True,
            },
        },
    )
    raise_if_error(response, "initialize")
    server.notify("initialized")


def list_threads(server: CodexAppServer, args: argparse.Namespace) -> list[dict[str, Any]]:
    """List threads by paging through the Codex thread/list endpoint.

    Args:
        server: Running Codex app-server wrapper.
        args: Parsed CLI arguments that control pagination and filters.

    Returns:
        Thread payloads returned by the app-server.
    """
    cursor: str | None = None
    threads: list[dict[str, Any]] = []

    for _ in range(args.max_pages):
        params: dict[str, Any] = {
            "limit": args.page_size,
            "sortKey": "updated_at",
            "sortDirection": "desc",
            "sourceKinds": SOURCE_KINDS,
        }

        if cursor is not None:
            params["cursor"] = cursor

        if args.search is not None:
            params["searchTerm"] = args.search

        if args.cwd is not None:
            params["cwd"] = args.cwd

        response = server.request("thread/list", params)
        raise_if_error(response, "thread/list")

        result = response.result or {}
        data = result.get("data")

        if isinstance(data, list):
            threads.extend([thread for thread in data if isinstance(thread, dict)])

        next_cursor = result.get("nextCursor")
        cursor = next_cursor if isinstance(next_cursor, str) and next_cursor else None

        if cursor is None:
            break

    return threads


def print_projects(threads: list[dict[str, Any]], show_threads: bool) -> None:
    """Print projects grouped from the thread list.

    Args:
        threads: Raw thread payloads returned by the app-server.
        show_threads: Whether to print a sample of threads under each project.
    """
    projects = Counter(read_text(thread.get("cwd")) or "<sans cwd>" for thread in threads)

    print(f"{len(threads)} thread(s)")
    print(f"{len(projects)} projet(s)")
    print()

    for cwd, count in projects.most_common():
        print(f"{count:4d}  {cwd}")

        if not show_threads:
            continue

        project_threads = [thread for thread in threads if (read_text(thread.get("cwd")) or "<sans cwd>") == cwd]

        for thread in project_threads[:10]:
            title = read_text(thread.get("name")) or read_text(thread.get("preview")) or "<sans titre>"
            source = read_text(thread.get("source")) or "unknown"
            updated_at = read_text(thread.get("updatedAt")) or "unknown"
            print(f"      - [{source}] {updated_at} {title}")


def raise_if_error(response: AppServerResponse, method: str) -> None:
    """Raise a runtime error when a JSON-RPC response contains an error.

    Args:
        response: Normalized app-server response to inspect.
        method: Method name used to contextualize the error.
    """
    if response.error is None:
        return

    message = response.error.get("message", response.error)
    raise RuntimeError(f"{method} failed: {message}")


def read_text(value: Any) -> str:
    """Normalize a raw JSON value into a string.

    Args:
        value: Raw JSON value to normalize.

    Returns:
        String value, or an empty string when the value is not a string.
    """
    return value if isinstance(value, str) else ""


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
    except Exception as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
