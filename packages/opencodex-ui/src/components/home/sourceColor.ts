/**
 * Shared helpers for source color choices and badge styling.
 */
import { amber, blue, indigo, orange, pink, purple, red, teal } from "@mui/material/colors";

import type { OpenCodexSourceColor } from "@open-codex-ui/opencodex-protocol";

export type SourceColorOption = {
  value: OpenCodexSourceColor;
  labelKey: string;
  main: string;
  contrastText: string;
};

export const SOURCE_COLOR_OPTIONS: SourceColorOption[] = [
  { value: "blue", labelKey: "sources.colors.blue", main: blue[600], contrastText: "#fff" },
  { value: "indigo", labelKey: "sources.colors.indigo", main: indigo[600], contrastText: "#fff" },
  { value: "purple", labelKey: "sources.colors.purple", main: purple[600], contrastText: "#fff" },
  { value: "pink", labelKey: "sources.colors.pink", main: pink[600], contrastText: "#fff" },
  { value: "red", labelKey: "sources.colors.red", main: red[600], contrastText: "#fff" },
  { value: "orange", labelKey: "sources.colors.orange", main: orange[600], contrastText: "#fff" },
  { value: "amber", labelKey: "sources.colors.amber", main: amber[600], contrastText: "#111" },
  { value: "teal", labelKey: "sources.colors.teal", main: teal[600], contrastText: "#fff" }
];

/**
 * Resolves one source color option and falls back to the default.
 *
 * @param color Source color value.
 *
 * @returns Matched option, or the default blue option.
 */
export function getSourceColorOption(color: OpenCodexSourceColor | null | undefined): SourceColorOption {
  return SOURCE_COLOR_OPTIONS.find((option) => option.value === color) ?? SOURCE_COLOR_OPTIONS[0]!;
}

/**
 * Returns badge styles for a source color.
 *
 * @param color Source color value.
 *
 * @returns Theme-aware badge styles.
 */
export function getSourceBadgeSx(color: OpenCodexSourceColor | null | undefined) {
  if (color === null) {
    return {
      bgcolor: orange[700],
      color: "#fff"
    };
  }

  const option = getSourceColorOption(color);

  return {
    bgcolor: option.main,
    color: option.contrastText
  };
}
