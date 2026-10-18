# Source defaults

In **Home → Sources**, select a source's **Configure** icon. The window has
separate **Connection** and **Default permissions** tabs. Its title identifies
the source being configured.

Connection settings belong to OpenCodexUI. Default permissions are read and
written through that source's Codex app-server API, in its user configuration.
Windows, WSL and remote paths are never opened through the host filesystem.

The default-permissions tab exposes file access, network access in workspace
write mode, when approval is required, and who reviews approval requests.
Automatic review can reject an action. Unspecified defaults are shown as
context-dependent; the editor does not guess an effective project policy.

Choose **Apply** to save. The window stays open and reports success only after
Codex confirms the saved defaults. Connection changes are saved independently.
Closing the window discards unapplied selections. Changes made elsewhere
require a refresh before saving again.

These defaults concern new chats. Saving does not reload existing chats;
their [per-chat permissions](thread-permissions.md) remain independent.
Project overrides, administrator requirements and runtime sandbox restrictions
can affect the permissions actually applied by Codex. Custom access profiles
are preserved, and unavailable or overridden choices are disabled.

Sources using the same user configuration share its defaults. The editor shows
the source-native configuration path and identifies matching files among
already connected sources in the same filesystem space. It does not connect
additional sources to detect sharing. Unconnected sources may also share the
file; identical paths on unrelated remote machines are not treated as shared.

Each source card keeps its actions visible in a compact vertical column. An
outlined star makes the source the default; a filled star and the badge next
to its name identify the current default source.
