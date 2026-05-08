/**
 * Renders a compact copy button with a short copied confirmation state.
 */
import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import { IconButton, Tooltip, type SxProps, type Theme } from "@mui/material";
import { useState } from "react";

type CopyIconButtonProps = {
  value: string;
  label: string;
  copiedLabel: string;
  buttonSize?: number;
  iconSize?: number;
  resetDelayMs?: number;
  sx?: SxProps<Theme>;
};

/**
 * Renders a copy-to-clipboard icon button.
 *
 * @param props Component props.
 *
 * @returns Rendered copy button.
 */
export function CopyIconButton({
  value,
  label,
  copiedLabel,
  buttonSize = 24,
  iconSize = 15,
  resetDelayMs = 1200,
  sx
}: CopyIconButtonProps) {
  const [hasCopied, setHasCopied] = useState(false);
  const currentLabel = hasCopied ? copiedLabel : label;

  function handleCopy(): void {
    void navigator.clipboard.writeText(value).then(() => {
      setHasCopied(true);
      window.setTimeout(() => {
        setHasCopied(false);
      }, resetDelayMs);
    });
  }

  return (
    <Tooltip title={currentLabel}>
      <IconButton
        aria-label={currentLabel}
        size="small"
        onClick={handleCopy}
        sx={{
          height: buttonSize,
          width: buttonSize,
          p: 0.25,
          ...sx
        }}
      >
        {hasCopied ? (
          <CheckOutlinedIcon sx={{ fontSize: iconSize }} />
        ) : (
          <ContentCopyOutlinedIcon sx={{ fontSize: iconSize }} />
        )}
      </IconButton>
    </Tooltip>
  );
}
