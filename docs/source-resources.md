# Local source resource controls

Open Home, Sources, Configure, then Resources for a native local source.
Normal priority and no CPU cap preserve the previous launch behavior.
These settings are saved per source, including across application restarts.
WSL, SSH and custom commands do not expose these controls: their execution
environment cannot be inferred from local file access.

Saving never restarts Codex, changes project associations or interrupts chats.
The next source launch uses the saved policy. To apply it to an existing
instance, wait until its work finishes and use Restart in the source list.
Temporary dictation clients use the same policy on their next launch, with
their own process group and therefore their own CPU budget.

## CPU priority and limits

Low and very low priorities favor competing applications. They do not limit
CPU usage when other programs are idle. An optional integer cap from 1 to 100
limits the aggregate CPU time of an app-server and its descendants. The cap
uses the host CPU capacity available to OpenCodexUI, rather than one core.
Scheduling intervals permit brief variation in the instantaneous CPU usage.
Separate sources have separate budgets; their percentages can add up to 100%.
There is no shared global budget or memory limit in this implementation.

The Electron interface, externally managed Docker containers, remote services
and programs launched independently of the app-server are outside this group.

## Platform integration

- Linux: `/usr/bin/nice` applies increments of 10 or 19 before Codex starts.
  A CPU cap uses a transient `systemd-run --user --scope` cgroup, retaining
  standard streams and the launch environment. OpenCodexUI converts the host
  percentage to systemd's single-core quota units. Low and very low priorities
  also set this scope's CPU weight to 25 and 1 (the system default is 100),
  so placing the tree in a separate cgroup preserves its lower scheduling share.
  A capability probe verifies
  the effective cgroup v2 quota inside the scope. systemd 254 or newer is
  required to disable argument variable expansion explicitly; no administrator
  access or system-wide configuration change is requested.
- Windows: the built-in Windows PowerShell compiles an embedded C# bridge
  against the installed .NET framework. No dependency or executable is
  downloaded. Codex starts suspended, is assigned to a Job Object with its
  priority and aggregate hard CPU cap, then resumes. The original byte streams
  are inherited directly. Closing the job kills remaining owned descendants.
  Native executable arguments use Windows quoting. Batch shims use `cmd.exe`;
  arguments containing shell expansion or embedded quotes are rejected with
  an instruction to select `codex.exe` instead.
  Windows release builds test native streams, descendant priority, npm batch
  shims and forced launcher cleanup before producing their artifacts.
- macOS: inherited niceness is supported; no CPU group quota adapter is
  provided. Other platforms show their controls as unavailable.

Capability discovery is lazy and cached for the application session. An
unavailable control is disabled with an explanation. Defaults can still be
restored after moving settings between hosts. Configured controls are checked
before saving and launching; a failed launcher never retries without limits.
Operational failures use the central error journal and snackbar.

Settings extend the existing source JSON document; no SQLite schema change or
data migration is needed. Old source rows retain their previous defaults.

## References

- [Windows Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)
- [Windows CPU rate control](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_cpu_rate_control_information)
- [systemd resource control](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html)
