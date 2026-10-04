import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { Box, Button, CssBaseline, Stack, Typography, useTheme } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { DebugStore } from "../../stores/debug/DebugStore";
import { DebugConsoleX } from "./DebugConsole";
import { DebugControlsX } from "./DebugControls";
import { DebugError } from "./DebugError";

/** App-mounted portal keeps the console alive when tools, projects or conversations change. */
export function DebugConsoleWindow({ store }: { store: DebugStore }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const host = store.consoleWindow.host;
  const cache = useMemo(() => host === null ? null : createCache({ key: "debug-console", container: host.window.document.head }), [host]);
  useEffect(() => () => store.consoleWindow.close(), [store]);
  useEffect(() => {
    if (host === null) return;
    host.window.document.title = `${t("debug.console")} — OpenCodexUI`;
    host.window.document.documentElement.lang = i18n.language;
    host.window.document.documentElement.style.colorScheme = theme.palette.mode;
  }, [host, cache, theme.palette.mode, t, i18n.language]);
  useEffect(() => () => cache?.sheet.flush(), [cache]);
  if (host === null || cache === null) return null;
  const session = store.snapshot.session;
  const title = session?.configuration.name ?? t("debug.noSession");
  const heading = session === null ? title : `${title} · ${t(`debug.states.${session.state}`)}`;
  const error = store.error === null ? null : <DebugError details={store.error} onClose={() => { store.error = null; }} />;
  const controls = store.active ? <DebugControlsX store={store} tooltipContainer={host.window.document.body} /> : null;
  return createPortal(<CacheProvider value={cache}>
    <CssBaseline enableColorScheme />
    <Stack sx={{ height: "100vh", bgcolor: "background.default", color: "text.primary", p: 2, gap: 1.5, boxSizing: "border-box" }}>
      <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" noWrap>{heading}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
            {session?.configuration.context.workspacePath}
          </Typography>
        </Box>
        <Button size="small" onClick={store.consoleWindow.close}>{t("debug.dockConsole")}</Button>
      </Stack>
      {controls}{error}
      <DebugConsoleX store={store} detached />
    </Stack>
  </CacheProvider>, host.container);
}
export const DebugConsoleWindowX = observer(DebugConsoleWindow);
