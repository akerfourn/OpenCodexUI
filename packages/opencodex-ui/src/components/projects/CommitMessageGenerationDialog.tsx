/**
 * Renders the optional instruction dialog for commit message generation.
 */
import MemoryOutlinedIcon from "@mui/icons-material/MemoryOutlined";
import PsychologyOutlinedIcon from "@mui/icons-material/PsychologyOutlined";
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

import type { OpenCodexReasoningEffort } from "@open-codex-ui/opencodex-protocol";

import type { AppStore } from "../../stores/AppStore";
import type { ProjectGitCommitStore } from "../../stores/ProjectGitCommitStore";
import { SettingMenuButton } from "../chat/SettingMenuButton";

type CommitMessageGenerationDialogProps = {
  appStore: AppStore;
  commitStore: ProjectGitCommitStore;
  modelOptions: string[];
  open: boolean;
  onClose(): void;
};

const defaultModelValue = "__default__";
const defaultReasoningValue = "__default__";

/**
 * Renders the generation confirmation dialog.
 *
 * @param props Component props.
 * @returns Rendered dialog.
 */
export function CommitMessageGenerationDialog({
  appStore,
  commitStore,
  modelOptions,
  open,
  onClose
}: CommitMessageGenerationDialogProps) {
  const { t } = useTranslation();
  const [instruction, setInstruction] = useState("");
  const [selectedModel, setSelectedModel] = useState<string | null>(
    () => commitStore.commitGenerationModel
  );
  const [selectedReasoningEffort, setSelectedReasoningEffort] = useState<OpenCodexReasoningEffort | null>(
    () => commitStore.commitGenerationReasoningEffort
  );
  const modelValue = selectedModel ?? defaultModelValue;
  const reasoningValue = selectedReasoningEffort ?? defaultReasoningValue;
  const reasoningModel = selectedModel ?? commitStore.commitGenerationModel;
  const reasoningEfforts = appStore.getReasoningEffortOptions(reasoningModel);
  const modelLabel = selectedModel
    ?? commitStore.commitGenerationModelLabel
    ?? t("commitPrompt.defaultModel");
  const reasoningEffort = selectedReasoningEffort
    ?? commitStore.commitGenerationReasoningEffortLabel;
  const reasoningLabel = reasoningEffort === null
    ? t("commitPrompt.defaultReasoning")
    : t(`reasoningEffort.${reasoningEffort}`, { defaultValue: reasoningEffort });

  useEffect(() => {
    if (open) {
      setInstruction("");
      setSelectedModel(commitStore.commitGenerationModel);
      setSelectedReasoningEffort(commitStore.commitGenerationReasoningEffort);
    }
  }, [commitStore, open]);

  function handleInstructionChange(event: ChangeEvent<HTMLInputElement>): void {
    setInstruction(event.target.value);
  }

  function handleModelChange(value: string): void {
    const nextModel = value === defaultModelValue ? null : value;
    setSelectedModel(nextModel);

    if (selectedReasoningEffort !== null) {
      setSelectedReasoningEffort(
        appStore.resolveReasoningEffort(
          nextModel ?? commitStore.commitGenerationModel,
          selectedReasoningEffort
        )
      );
    }
  }

  function handleReasoningEffortChange(value: string): void {
    setSelectedReasoningEffort(
      value === defaultReasoningValue ? null : value as OpenCodexReasoningEffort
    );
  }

  function handleClose(): void {
    onClose();
  }

  function handleGenerate(): void {
    if (!commitStore.canGenerateCommitMessage) {
      return;
    }

    void commitStore.generateCommitMessage(
      instruction,
      selectedModel,
      selectedReasoningEffort
    );
    onClose();
  }

  return (
    <Dialog open={open} fullWidth maxWidth="sm" onClose={handleClose}>
      <DialogTitle>{t("git.generateDialogTitle")}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          <Stack direction="row" spacing={0.75} sx={{ minWidth: 0, flexWrap: "wrap" }}>
            <SettingMenuButton
              icon={<MemoryOutlinedIcon fontSize="small" />}
              label={t("composer.model")}
              value={modelValue}
              options={[
                { value: defaultModelValue, label: t("commitPrompt.defaultModel") },
                ...modelOptions.map((model) => ({ value: model, label: model }))
              ]}
              onChange={handleModelChange}
            />
            <SettingMenuButton
              icon={<PsychologyOutlinedIcon fontSize="small" />}
              label={t("composer.reasoning")}
              value={reasoningValue}
              options={[
                { value: defaultReasoningValue, label: t("commitPrompt.defaultReasoning") },
                ...reasoningEfforts.map((option) => ({
                  value: option.reasoningEffort,
                  label: t(`reasoningEffort.${option.reasoningEffort}`, {
                    defaultValue: option.reasoningEffort
                  })
                }))
              ]}
              onChange={handleReasoningEffortChange}
            />
          </Stack>
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
          disabled={!commitStore.canGenerateCommitMessage}
          onClick={handleGenerate}
        >
          {t("git.generateMessage")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export const CommitMessageGenerationDialogX = observer(CommitMessageGenerationDialog);
