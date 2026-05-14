/**
 * Defines the Material UI theme shared by the OpenCodex UI renderer.
 */
import { createTheme, type PaletteMode } from "@mui/material/styles";

export type OpenCodexPaletteMode = Extract<PaletteMode, "light" | "dark">;

/**
 * Creates the OpenCodexUI Material UI theme for the requested palette mode.
 *
 * @param mode Palette mode.
 *
 * @returns MUI theme.
 */
export function createOpenCodexTheme(mode: OpenCodexPaletteMode) {
  const isDark = mode === "dark";

  return createTheme({
    palette: {
      mode,
      primary: {
        main: isDark ? "#58a6ff" : "#0969da",
        contrastText: isDark ? "#08111f" : "#ffffff"
      },
      background: {
        default: isDark ? "#0d1117" : "#f6f8fa",
        paper: isDark ? "#161b22" : "#ffffff"
      },
      text: {
        primary: isDark ? "#e6edf3" : "#1f2328",
        secondary: isDark ? "#8b949e" : "#6b7280"
      },
      divider: isDark ? "#30363d" : "#d8dee4",
      action: {
        hover: isDark ? "rgba(177, 186, 196, 0.10)" : "rgba(31, 35, 40, 0.06)",
        selected: isDark ? "rgba(88, 166, 255, 0.16)" : "rgba(9, 105, 218, 0.10)"
      }
    },
    shape: {
      borderRadius: 6
    },
    typography: {
      fontFamily:
        'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      button: {
        textTransform: "none",
        fontWeight: 600
      }
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: isDark ? "#0d1117" : "#f6f8fa"
          }
        }
      }
    }
  });
}

export const opencodexTheme = createOpenCodexTheme("light");
