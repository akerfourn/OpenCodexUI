/**
 * Renders the optional instruction dialog for commit message generation.
 */
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography
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
  const modelLabel = gitStore.commitGenerationModelLabel ?? t("commitPrompt.defaultModel");
  const reasoningLabel = gitStore.commitGenerationReasoningEffortLabel ?? t("commitPrompt.defaultReasoning");

  useEffect(() => {
    if (open) {
      setInstruction("");
    }
  }, [open]);

  function handleInstructionChange(event: ChangeEvent<HTMLInputElement>): void {
    setInstruction(event.target.value);
  }

  function handleClose(): void {
    onClose();
  }

  function handleGenerate(): void {
    if (!gitStore.canGenerateCommitMessage) {
      return;
    }

    void gitStore.generateCommitMessage(instruction);
    onClose();
  }

  return (
    <Dialog open={open} fullWidth maxWidth="sm" onClose={handleClose}>
      <DialogTitle>{t("git.generateDialogTitle")}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            {t("git.generateRuntime", {
              model: modelLabel,
              reasoning: reasoningLabel
            })}
          </Typography>
          <TextField
            label={t("git.generateInstruction")}
            value={instruction}
            minRows={4}
            margin="dense"
            multiline
            fullWidth
            helperText={t("git.generateInstructionHelp")}
            onChange={handleInstructionChange}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>
          {t("git.generateCancel")}
        </Button>
        <Button
          variant="contained"
          disabled={!gitStore.canGenerateCommitMessage}
          onClick={handleGenerate}
        >
          {t("git.generateMessage")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export const CommitMessageGenerationDialogX = observer(CommitMessageGenerationDialog);
