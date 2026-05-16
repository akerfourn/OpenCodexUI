/**
 * Renders live logs for one project command run.
 */
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { ProjectCommandRunView } from "../../stores/ProjectCommandsStore";

type ProjectCommandLogsDialogProps = {
  run: ProjectCommandRunView | null;
  open: boolean;
  onClose(): void;
};

/**
 * Renders a scrollable command log modal.
 *
 * @param props Component props.
 * @returns Rendered log modal.
 */
export function ProjectCommandLogsDialog({
  run,
  open,
  onClose
}: ProjectCommandLogsDialogProps) {
  const { t } = useTranslation();
  const lines = run?.lines ?? [];

  return (
    <Dialog open={open} fullWidth maxWidth="md" onClose={onClose}>
      <DialogTitle>{t("commands.logsTitle")}</DialogTitle>
      <DialogContent>
        <Stack spacing={1}>
          {run?.logPath !== null && run?.logPath !== undefined ? (
            <Typography variant="caption" color="text.secondary">
              {run.logPath}
            </Typography>
          ) : null}
          <Box className="project-command-log-output">
            {lines.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t("commands.noLogs")}
              </Typography>
            ) : (
              lines.map((line) => (
                <Typography
                  key={line.id}
                  component="div"
                  className={`project-command-log-line is-${line.stream}`}
                >
                  {line.text.length === 0 ? " " : line.text}
                </Typography>
              ))
            )}
          </Box>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

export const ProjectCommandLogsDialogX = observer(ProjectCommandLogsDialog);
