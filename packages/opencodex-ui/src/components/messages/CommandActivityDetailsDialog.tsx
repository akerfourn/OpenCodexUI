/**
 * Renders command activity details in a scrollable dialog.
 */
import { Box, Dialog, DialogContent, DialogTitle, Stack } from "@mui/material";
import { useTranslation } from "react-i18next";

import { CommandDetailBlock } from "./CommandDetailBlock";
import { CommandMetadataRow } from "./CommandMetadataRow";
import type { CommandActivityDetails } from "./commandActivityDetails";

type CommandActivityDetailsDialogProps = {
  open: boolean;
  details: CommandActivityDetails;
  /**
   * Handles dialog close.
   *
   * @returns Nothing.
   */
  onClose(): void;
};

/**
 * Renders command activity details in a scrollable dialog.
 *
 * @param props Component props.
 *
 * @returns Rendered dialog.
 */
export function CommandActivityDetailsDialog({
  open,
  details,
  onClose
}: CommandActivityDetailsDialogProps) {
  const { t } = useTranslation();
  const hasMetadata = (
    details.cwd !== null ||
    details.status !== null ||
    details.exitCode !== null ||
    details.durationMs !== null
  );

  return (
    <Dialog open={open} fullWidth maxWidth="lg" onClose={onClose}>
      <DialogTitle>{t("message.commandDetails")}</DialogTitle>
      <DialogContent
        dividers
        sx={{
          maxHeight: "75vh",
          overflow: "auto"
        }}
      >
        <Stack spacing={2}>
          <CommandDetailBlock
            label={t("message.command")}
            value={details.command}
            emptyLabel={t("message.commandUnavailable")}
          />

          {hasMetadata ? (
            <Box
              sx={{
                color: "text.secondary",
                display: "grid",
                gap: 0.5,
                gridTemplateColumns: "max-content minmax(0, 1fr)"
              }}
            >
              <CommandMetadataRow label={t("message.commandCwd")} value={details.cwd} />
              <CommandMetadataRow label={t("message.commandStatus")} value={details.status} />
              <CommandMetadataRow label={t("message.commandExitCode")} value={details.exitCode} />
              <CommandMetadataRow label={t("message.commandDuration")} value={details.durationMs} />
            </Box>
          ) : null}

          <CommandDetailBlock
            label={t("message.commandOutput")}
            value={details.output ?? ""}
            emptyLabel={t("message.commandOutputUnavailable")}
          />
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
