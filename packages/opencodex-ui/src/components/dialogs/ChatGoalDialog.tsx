/** Provides a small editor for the native Codex goal attached to a chat. */
import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutlineOutlined";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { useTranslation } from "react-i18next";

import type { OpenCodexThreadGoal } from "@open-codex-ui/opencodex-protocol";

import type { ChatStore } from "../../stores/chat/ChatStore";
import { ChatGoalSummary } from "./ChatGoalSummary";

type ChatGoalDialogProps = {
  open: boolean;
  chatStore: ChatStore;
  onClose(): void;
};

/** Renders and edits the native goal state for one chat. */
export function ChatGoalDialog({ open, chatStore, onClose }: ChatGoalDialogProps) {
  const { t } = useTranslation();
  const goalStore = chatStore.goal;
  const [objective, setObjective] = useState("");
  const [tokenBudget, setTokenBudget] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const goal = goalStore.goal;
  const canMutate = !chatStore.isReadOnlyFromCache && chatStore.sourceId !== null;

  useEffect(() => {
    if (!open) {
      return;
    }

    let isCancelled = false;

    const loadGoal = async (): Promise<void> => {
      await goalStore.load(true);

      if (!isCancelled) {
        applyGoalToForm(goalStore.goal);
      }
    };

    void loadGoal();

    return () => {
      isCancelled = true;
    };
  }, [goalStore, open]);

  function applyGoalToForm(currentGoal: OpenCodexThreadGoal | null): void {
    setObjective(currentGoal?.objective ?? "");
    setTokenBudget(
      currentGoal?.tokenBudget === null || currentGoal?.tokenBudget === undefined
        ? ""
        : String(currentGoal.tokenBudget)
    );
  }

  async function handleSave(): Promise<void> {
    const trimmedObjective = objective.trim();

    if (trimmedObjective.length === 0) {
      setValidationError(t("goal.objectiveRequired"));
      return;
    }

    const parsedBudget = readTokenBudget(tokenBudget);

    if (parsedBudget.error) {
      setValidationError(t("goal.budgetInvalid"));
      return;
    }

    setValidationError(null);
    const saved = await goalStore.save({
      objective: trimmedObjective,
      status: goal?.status ?? "active",
      tokenBudget: parsedBudget.value
    });

    if (saved) {
      applyGoalToForm(goalStore.goal);
    }
  }

  async function handleClear(): Promise<void> {
    if (!canMutate || typeof window === "undefined") {
      return;
    }

    if (!window.confirm(t("goal.clearConfirmation"))) {
      return;
    }

    const cleared = await goalStore.clear();

    if (cleared) {
      setObjective("");
      setTokenBudget("");
    }
  }

  async function handlePause(): Promise<void> {
    await goalStore.updateStatus("paused");
  }

  async function handleResume(): Promise<void> {
    await goalStore.updateStatus("active");
  }

  const isBusy = goalStore.isLoading || goalStore.isSaving;

  return (
    <Dialog open={open} fullWidth maxWidth="sm" onClose={onClose}>
      <DialogTitle>{t("goal.title")}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            {t("goal.description")}
          </Typography>

          {goalStore.error !== null ? (
            <Alert severity="error">{t("goal.error", { message: goalStore.error })}</Alert>
          ) : null}

          {validationError !== null ? <Alert severity="warning">{validationError}</Alert> : null}

          {goalStore.isLoading && goalStore.hasLoaded === false ? (
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <CircularProgress size={18} />
              <Typography variant="body2">{t("goal.loading")}</Typography>
            </Stack>
          ) : null}

          {goal !== null ? <ChatGoalSummary goal={goal} /> : null}

          <TextField
            label={t("goal.objective")}
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
            placeholder={t("goal.objectivePlaceholder")}
            helperText={t("goal.objectiveHint")}
            multiline
            minRows={3}
            fullWidth
            disabled={!canMutate || isBusy}
          />

          <TextField
            label={t("goal.tokenBudget")}
            value={tokenBudget}
            onChange={(event) => setTokenBudget(event.target.value)}
            placeholder={t("goal.tokenBudgetPlaceholder")}
            helperText={t("goal.tokenBudgetHint")}
            type="number"
            slotProps={{ htmlInput: { min: 1, step: 1 } }}
            fullWidth
            disabled={!canMutate || isBusy}
          />

          {goal?.status === "active" ? (
            <Button
              startIcon={<PauseCircleOutlineIcon />}
              onClick={handlePause}
              disabled={!canMutate || isBusy}
              variant="outlined"
              sx={{ alignSelf: "flex-start" }}
            >
              {t("goal.pause")}
            </Button>
          ) : null}

          {goal?.status === "paused" ? (
            <Button
              startIcon={<PlayArrowIcon />}
              onClick={handleResume}
              disabled={!canMutate || isBusy}
              variant="outlined"
              sx={{ alignSelf: "flex-start" }}
            >
              {t("goal.resume")}
            </Button>
          ) : null}

          {chatStore.isReadOnlyFromCache ? (
            <Alert severity="info">{t("goal.readOnly")}</Alert>
          ) : null}

          {chatStore.sourceId === null ? (
            <Alert severity="info">{t("goal.noSource")}</Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        {goal !== null ? (
          <Button
            color="error"
            startIcon={<DeleteOutlineIcon />}
            onClick={handleClear}
            disabled={!canMutate || isBusy}
          >
            {t("goal.clear")}
          </Button>
        ) : null}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>{t("goal.close")}</Button>
        <Button
          variant="contained"
          onClick={() => void handleSave()}
          disabled={!canMutate || isBusy}
        >
          {goalStore.isSaving ? <CircularProgress size={18} color="inherit" /> : t("goal.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Parses a positive integer budget while treating an empty field as the server default. */
export function readTokenBudget(value: string): { value: number | null; error: boolean } {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return { value: null, error: false };
  }

  const parsedValue = Number(trimmedValue);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return { value: null, error: true };
  }

  return { value: parsedValue, error: false };
}

export const ChatGoalDialogX = observer(ChatGoalDialog);
