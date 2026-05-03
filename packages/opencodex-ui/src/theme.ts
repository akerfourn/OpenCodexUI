/**
 * Defines the Material UI theme shared by the OpenCodex UI renderer.
 */
import { createTheme } from "@mui/material/styles";

export const opencodexTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#0969da"
    },
    background: {
      default: "#f6f8fa",
      paper: "#ffffff"
    },
    text: {
      primary: "#1f2328",
      secondary: "#6b7280"
    },
    divider: "#d8dee4"
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
  }
});
