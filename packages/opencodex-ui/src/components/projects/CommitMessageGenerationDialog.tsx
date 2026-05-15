/**
 * Renders the optional instruction dialog for commit message generation.
 */
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField
} from "@mui/material";
import { observer } from "mobx-react-lite";
import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ProjectGitStore } from "../../stores/ProjectGitStore";

type CommitMessageGenerationDialogProps = {
  gitStore: ProjectGitStore;
  open: boolean;
  onClose(): void;
};

/**
 * Renders the generation confirmation dialog.
 *
 * @param props Component props.
 * @returns Rendered dialog.
 */
export function CommitMessageGenerationDialog({
  gitStore,
  open,
  onClose
}: CommitMessageGenerationDialogProps) {
  const { t } = useTranslation();
  const [instruction, setInstruction] = useState("");

  useEffect(() => {
    if (open) {
      setInstruction("");
    }
  }, [open]);

  function handleInstructionChange(event: ChangeEvent<HTMLInputElement>): void {
    setInstruction(event.target.value);
  }

  function handleClose(): void {
    if (!gitStore.isGeneratingCommitMessage) {
      onClose();
    }
  }

  async function handleGenerate(): Promise<void> {
    await gitStore.generateCommitMessage(instruction);

    if (gitStore.errorMessage === null) {
      onClose();
    }
  }

  return (
    <Dialog open={open} fullWidth maxWidth="sm" onClose={handleClose}>
      <DialogTitle>{t("git.generateDialogTitle")}</DialogTitle>
      <DialogContent>
        <TextField
          label={t("git.generateInstruction")}
          value={instruction}
          minRows={4}
          margin="dense"
          multiline
          fullWidth
          disabled={gitStore.isGeneratingCommitMessage}
          helperText={t("git.generateInstructionHelp")}
          onChange={handleInstructionChange}
        />
      </DialogContent>
      <DialogActions>
        <Button disabled={gitStore.isGeneratingCommitMessage} onClick={handleClose}>
          {t("git.generateCancel")}
        </Button>
        <Button
          variant="contained"
          disabled={!gitStore.canGenerateCommitMessage}
          startIcon={
            gitStore.isGeneratingCommitMessage
              ? <CircularProgress color="inherit" size={16} />
              : undefined
          }
          onClick={handleGenerate}
        >
          {gitStore.isGeneratingCommitMessage ? t("git.generatingMessage") : t("git.generateMessage")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export const CommitMessageGenerationDialogX = observer(CommitMessageGenerationDialog);
