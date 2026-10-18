# Codex source updates

Home offers **Update** when a newer release is available for an eligible
standalone Codex installation. This supports local sources, native WSL sources
and custom sources that directly launch `wsl.exe`.

For WSL, OpenCodexUI resolves the configured executable and its symbolic links
inside the selected distribution, preserving an explicit WSL user when present.
The executable must resolve into a native Linux `.codex/packages/standalone/`
installation. Windows interop executables, npm installations and custom shell
wrappers are not automatically updated. A command missing from WSL's
noninteractive PATH should use an absolute Linux path in the source settings.

The update runs through `wsl.exe` with separate arguments and no Windows shell.
If the source uses the default distribution, the probe identifies its name so
the actual update stays pinned to that distribution. Detection failures do not
prevent other sources from loading.

An update requires an idle source. OpenCodexUI confirms process shutdown before
running the updater, blocks source reconnection and lifecycle controls during
the update, then restores the previous running state. A manually stopped or
unused source stays stopped. If the updater fails, a previously running source
is reconnected when possible, and the error remains visible on the source.

After a successful updater exit, OpenCodexUI refreshes source versions. If an
eligible source still reports its previous version, check whether its command
points directly to an old version under `standalone/releases/`. Prefer the
installation's stable launcher or `standalone/current/` link.
