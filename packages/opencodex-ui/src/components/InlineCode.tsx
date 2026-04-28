import { Box } from "@mui/material";
import type { ReactNode } from "react";

type InlineCodeProps = {
  className?: string;
  children?: ReactNode;
};

export function InlineCode({ className, children }: InlineCodeProps) {
  return (
    <Box
      component="code"
      className={className}
      sx={{
        px: 0,
        py: 0,
        border: 0,
        borderRadius: 0,
        color: "#0f172a",
        bgcolor: "transparent",
        fontFamily:
          'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace',
        fontSize: "0.94em",
        whiteSpace: "break-spaces"
      }}
    >
      {children}
    </Box>
  );
}
