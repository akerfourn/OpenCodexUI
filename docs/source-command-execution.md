# Source command execution

OpenCodexUI's Git, file tools, project commands and Docker requests use the
selected source's Codex app-server. CPU limits affect the app-server launch;
command executable lookup is a separate boundary and also applies when
priority is normal and CPU usage is unlimited.

## Native Windows sources

For a native local Windows source, OpenCodexUI verifies bare executable names
against the host's native system directory and `PATH` before sending
`process/spawn` or `command/exec`. The request carries an absolute executable
path when lookup succeeds. Arguments, working directory and process options
are retained; no shell or automatic retry is introduced.

This avoids relying on differences between Windows and Rust executable
search, including malformed quotes in an earlier `PATH` entry hiding later
tools. Every candidate must exist as a file. Native `.exe` and `.com` files
are supported; explicit paths and other launcher types retain Codex's normal
handling. The environment itself is never rewritten by this resolver.

Command-specific `PATH` and `SystemRoot` overrides, including unset values,
take precedence. Successful lookups are cached per source client for 30
seconds, with at most 256 entries. Missing programs are checked again on the
next request. Optional lookup is bounded to two seconds; on slow or unavailable
paths, the original command goes to Codex. This is a launch-time lookup, with
no continuous watcher.

WSL, SSH and custom commands keep source-side lookup. Local access to files
does not prove that a custom command runs in the Electron host environment.
Unix sources likewise keep their original launch behavior. Commands generated
internally by the agent, rather than sent through these UI APIs, remain under
Codex's control.

## Failure diagnostics

A rejected RPC retains its method and error code even when Codex returns no
error data. Process errors also retain the executable and working directory.
The application journal adds the originating UI request type and explicit
source identifier. Scripts, argv after the executable, stdin, environment
values and conversation contents are excluded from this added metadata.

The Git panel offers initialization only after a successful status request
establishes that the folder has no repository. A failed launch leaves that
state unknown and uses the central error journal and snackbar. Refresh can
retry discovery without creating or rewriting a repository.

## Validation

Regression tests cover native source isolation, explicit paths, malformed
quoted `PATH` entries, command-specific environment overrides, cache expiry,
RPC argument preservation, diagnostics redaction, and unknown Git state.
Windows release builds also exercise native executable lookup with a
temporary executable in a directory containing spaces.

Related upstream report:
[Git lookup with a quoted Windows PATH](https://github.com/openai/codex/issues/38421).
This documents one reproducible lookup failure, rather than identifying the
exact contents of a user's unavailable environment.
