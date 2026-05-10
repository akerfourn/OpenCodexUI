/**
 * Renders the confirmation dialog used before closing a project tab.
 */
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { RootStore } from "../../stores/RootStore";
import type { ProjectStore } from "../../stores/ProjectStore";

type CloseProjectDialogProps = {
  store: RootStore;
};

/**
 * Renders project close confirmation.
 *
 * @param props Component props.
 *
 * @returns Rendered dialog.
 */
export function CloseProjectDialog({ store }: CloseProjectDialogProps) {
  const { t } = useTranslation();
  const [isConfirmed, setIsConfirmed] = useState(false);
  const navigationStore = store.navigationStore;
  const projectStore = navigationStore.projectCloseRequest;
  const isOpen = projectStore !== null;
  const hasRunningTurn = projectStore === null ? false : hasRunningChat(projectStore);
  const projectName = projectStore?.displayName ?? "";

  function handleCancel(): void {
    setIsConfirmed(false);
    navigationStore.cancelCloseProject();
  }

  function handleConfirmToggle(): void {
    setIsConfirmed((current) => !current);
  }

  function handleSubmit(): void {
    navigationStore.confirmCloseProject();
    setIsConfirmed(false);
  }

  return (
    <Dialog open={isOpen} onClose={handleCancel} fullWidth maxWidth="sm">
      <DialogTitle>
        {t("closeProject.title", { project: projectName })}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {t("closeProject.description")}
        </Typography>
        {hasRunningTurn ? (
          <Typography variant="body2" color="error" sx={{ mb: 2 }}>
            {t("closeProject.runningTurn")}
          </Typography>
        ) : null}
        <FormControlLabel
          control={<Checkbox checked={isConfirmed} onChange={handleConfirmToggle} />}
          label={t("closeProject.confirmCheckbox")}
        />
      </DialogContent>
      <DialogActions>
        <Button type="button" onClick={handleCancel}>
          {t("closeProject.cancel")}
        </Button>
        <Button
          type="button"
          variant="contained"
          color="error"
          disabled={!isConfirmed || hasRunningTurn}
          onClick={handleSubmit}
        >
          {t("closeProject.submit")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export const CloseProjectDialogX = observer(CloseProjectDialog);

/**
 * Checks whether a project has a running chat.
 *
 * @param projectStore Project store to inspect.
 *
 * @returns `true` when a chat is active.
 */
function hasRunningChat(projectStore: ProjectStore): boolean {
  for (const chatStore of projectStore.chatsById.values()) {
    if (chatStore.isWorking || chatStore.isStartingTurn || chatStore.isRecovering) {
      return true;
    }
  }

  return false;
}
