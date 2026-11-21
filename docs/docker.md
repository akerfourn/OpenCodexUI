# Docker availability

Home's Docker section uses the Docker CLI and active context on the computer
running OpenCodexUI. Project Compose operations use the selected Codex source.
These environments can differ for WSL, SSH and custom sources. OpenCodexUI
does not install Docker, start its engine or switch its context automatically.

## Optional dependencies

Missing executables, a missing Compose plugin, an unreachable engine and
denied access are module availability states. They appear as an orange dot
on the module and a compact status control in its panel. Clicking the status
opens an explanation with a **Check again** action. They do not generate
recurring application errors or snackbars.

A missing executable means Docker could not be found in the execution
environment; it can also indicate an incomplete `PATH`. An unreachable
engine can mean Docker Desktop is stopped, the service is stopped, or the
active Docker context cannot connect. The state does not assume which cause
applies. Unrecognized failures remain errors rather than being silently
classified as an optional dependency problem.

## Project refresh and recovery

Compose file discovery does not require Docker. A detected file keeps the
Compose module accessible even when Docker is unavailable. No Docker process
is started for a directory without a Compose file or before an explicit
choice between multiple files.

Healthy snapshots keep the existing visible-panel polling. A failed snapshot
pauses polling, including refreshes triggered by window visibility. Use the
panel refresh or **Check again** after fixing the environment. A successful
check clears the indicator and resumes polling.

Recognized command failures determine the setup state directly. For an
unrecognized project failure, independent, bounded `docker version` and
`docker compose version --short` checks distinguish runtime dependencies from
project configuration. Healthy snapshots do not incur these extra probes.

Unexpected project failures stay in the central error journal, including the
source, project, Compose file, failed stage and available exit/error codes.
Resolved configuration, command output and environment values are excluded.
An unchanged failed snapshot is not repeatedly reported. Explicit lifecycle
action failures still use the normal central error handling.

Workspace maintenance continues to require a positively verified idle Docker
state when applicable; an unavailable Docker environment does not bypass
deletion or movement safeguards.

## Docker documentation

- [Docker Desktop for Windows][windows]
- [Client and engine versions][version]
- [Compose plugin version][compose]

[windows]: https://docs.docker.com/desktop/setup/install/windows-install/
[version]: https://docs.docker.com/reference/cli/docker/version/
[compose]: https://docs.docker.com/reference/cli/docker/compose/version/
