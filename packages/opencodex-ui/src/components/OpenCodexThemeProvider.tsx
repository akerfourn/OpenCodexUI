/**
 * Provides the OpenCodexUI Material UI theme.
 */
import { CssBaseline, useMediaQuery } from "@mui/material";
import { StyledEngineProvider, ThemeProvider } from "@mui/material/styles";
import { observer } from "mobx-react-lite";
import { useLayoutEffect, useMemo, type ReactNode } from "react";

import type { OpenCodexColorScheme } from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../stores/RootStore";
import { createOpenCodexTheme, type OpenCodexPaletteMode } from "../theme";

type OpenCodexThemeProviderProps = {
  store: RootStore;
  children: ReactNode;
};

/**
 * Provides the OpenCodexUI Material UI theme.
 *
 * @param props Component props.
 *
 * @returns Rendered theme provider.
 */
export function OpenCodexThemeProvider({
  store,
  children
}: OpenCodexThemeProviderProps) {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)", { noSsr: true });
  const mode = resolvePaletteMode(store.appStore.settings.colorScheme, prefersDark);
  const theme = useMemo(() => createOpenCodexTheme(mode), [mode]);

  useLayoutEffect(() => {
    document.documentElement.dataset.opencodexColorScheme = mode;
  }, [mode]);

  return (
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={theme}>
        <CssBaseline enableColorScheme />
        {children}
      </ThemeProvider>
    </StyledEngineProvider>
  );
}

export const OpenCodexThemeProviderX = observer(OpenCodexThemeProvider);

function resolvePaletteMode(
  colorScheme: OpenCodexColorScheme,
  prefersDark: boolean
): OpenCodexPaletteMode {
  if (colorScheme === "dark") {
    return "dark";
  }

  if (colorScheme === "light") {
    return "light";
  }

  return prefersDark ? "dark" : "light";
}
