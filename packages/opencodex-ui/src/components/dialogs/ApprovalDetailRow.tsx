/**
 * Renders one labeled approval detail row.
 */
import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";

type ApprovalDetailRowProps = {
  label: string;
  value: ReactNode;
  monospace?: boolean;
};

/**
 * Renders one approval detail row.
 *
 * @param props Component props.
 *
 * @returns Rendered detail row.
 */
export function ApprovalDetailRow({ label, value, monospace = false }: ApprovalDetailRowProps) {
  return (
    <Box sx={{ display: "grid", gap: 0.5 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          bgcolor: "action.hover",
          px: 1.25,
          py: 0.875,
          fontFamily: monospace
            ? 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace'
            : undefined,
          overflowWrap: "anywhere",
          whiteSpace: monospace ? "pre-wrap" : "normal"
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}
