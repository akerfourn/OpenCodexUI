/**
 * Confirms removal of a project from the local cache.
 */
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Typography
} from "@mui/material";
import { useTranslation } from "react-i18next";

import type { OpenCodexProject } from "@open-codex-ui/opencodex-protocol";

type HomeProjectDeleteDialogProps = {
  project: OpenCodexProject | null;
  onCancel(): void;
  onConfirm(projectId: string): void;
};

/**
 * Renders the project cache deletion confirmation dialog.
 *
 * @param props Component props.
 *
 * @returns Rendered dialog.
 */
export function HomeProjectDeleteDialog({
  project,
  onCancel,
  onConfirm
}: HomeProjectDeleteDialogProps) {
  const { t } = useTranslation();
  const projectName = project?.displayName ?? project?.defaultName ?? "";

  function handleConfirm(): void {
    if (project === null) {
      return;
    }

    onConfirm(project.id);
  }

  return (
    <Dialog open={project !== null} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{t("home.deleteProjectTitle", { project: projectName })}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {t("home.deleteProjectDescription")}
        </DialogContentText>
        {project !== null ? (
          <Typography
            component="p"
            variant="body2"
            sx={{ mt: 2, overflowWrap: "anywhere" }}
          >
            {project.path}
          </Typography>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>
          {t("home.deleteProjectCancel")}
        </Button>
        <Button onClick={handleConfirm} color="error" variant="contained">
          {t("home.deleteProjectConfirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
