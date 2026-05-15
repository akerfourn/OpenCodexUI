/**
 * Renders application log details.
 */
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  Typography
} from "@mui/material";
import { useTranslation } from "react-i18next";

import type { OpenCodexLogEntry } from "@open-codex-ui/opencodex-protocol";

import { CopyIconButton } from "../common/CopyIconButton";

type HomeLogDetailsDialogProps = {
  log: OpenCodexLogEntry | null;
  onClose(): void;
};

/**
 * Renders a scrollable log details dialog.
 *
 * @param props Component props.
 *
 * @returns Rendered details dialog.
 */
export function HomeLogDetailsDialog({ log, onClose }: HomeLogDetailsDialogProps) {
  const { t } = useTranslation();
  const copyValue = log === null ? "" : formatLogForClipboard(log);

  return (
    <Dialog open={log !== null} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Box sx={{ flex: "1 1 auto" }}>
            {t("logs.details")}
          </Box>
          {log === null ? null : (
            <CopyIconButton
              value={copyValue}
              label={t("logs.copy")}
              copiedLabel={t("message.copied")}
              buttonSize={32}
              iconSize={18}
            />
          )}
        </Stack>
      </DialogTitle>
      <DialogContent dividers sx={{ maxHeight: "70vh" }}>
        {log === null ? null : (
          <Stack spacing={2}>
            <Typography variant="caption" color="text.secondary">
              {new Date(log.createdAt).toLocaleString()} - {t(`logs.types.${log.type}`)}
            </Typography>
            <Typography variant="body1">
              {log.message}
            </Typography>
            <Typography
              component="pre"
              variant="body2"
              sx={{
                bgcolor: "background.default",
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                maxHeight: "48vh",
                overflow: "auto",
                p: 2,
                whiteSpace: "pre-wrap"
              }}
            >
              {formatDetails(log.details)}
            </Typography>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}

function formatDetails(details: unknown): string {
  if (details === null || details === undefined) {
    return "";
  }

  if (typeof details === "string") {
    return details;
  }

  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

function formatLogForClipboard(log: OpenCodexLogEntry): string {
  return [
    `id: ${log.id}`,
    `createdAt: ${log.createdAt}`,
    `type: ${log.type}`,
    "",
    "message:",
    log.message,
    "",
    "details:",
    formatDetails(log.details)
  ].join("\n");
}
