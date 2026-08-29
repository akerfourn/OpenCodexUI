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
  const [savingAction, setSavingAction] = useState<"save" | "start" | null>(null);
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
    const formValues = readGoalFormValues(objective, tokenBudget);

    if (formValues.error !== null) {
      setValidationError(t(`goal.${formValues.error}`));
      return;
    }

    setValidationError(null);
    setSavingAction("save");

    try {
      const saved = await goalStore.save({
        objective: formValues.values.objective,
        status: goal?.status === "active" ? "active" : "paused",
        tokenBudget: formValues.values.tokenBudget
      });

      if (saved) {
        applyGoalToForm(goalStore.goal);
      }
    } finally {
      setSavingAction(null);
    }
  }

  async function handleStart(): Promise<void> {
    const formValues = readGoalFormValues(objective, tokenBudget);

    if (formValues.error !== null) {
      setValidationError(t(`goal.${formValues.error}`));
      return;
    }

    setValidationError(null);
    setSavingAction("start");

    try {
      const started = await goalStore.save({
        objective: formValues.values.objective,
        status: "active",
        tokenBudget: formValues.values.tokenBudget
      });

      if (started) {
        applyGoalToForm(goalStore.goal);
      }
    } finally {
      setSavingAction(null);
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

  const isBusy = goalStore.isLoading || goalStore.isSaving;
  const canStart = goal === null || goal.status !== "active";
  const startLabel = goalStore.hasStarted ? t("goal.resume") : t("goal.start");

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

          {goal !== null ? (
            <ChatGoalSummary goal={goal} hasStarted={goalStore.hasStarted} />
          ) : null}

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
              type="button"
              startIcon={<PauseCircleOutlineIcon />}
              onClick={handlePause}
              disabled={!canMutate || isBusy}
              variant="outlined"
              sx={{ alignSelf: "flex-start" }}
            >
              {t("goal.pause")}
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
            type="button"
            color="error"
            startIcon={<DeleteOutlineIcon />}
            onClick={handleClear}
            disabled={!canMutate || isBusy}
          >
            {t("goal.clear")}
          </Button>
        ) : null}
        <Box sx={{ flex: 1 }} />
        <Button type="button" onClick={onClose}>{t("goal.close")}</Button>
        <Button
          type="button"
          variant="outlined"
          onClick={() => void handleSave()}
          disabled={!canMutate || isBusy}
        >
          {savingAction === "save" ? <CircularProgress size={18} color="inherit" /> : t("goal.save")}
        </Button>
        {canStart ? (
          <Button
            type="button"
            variant="contained"
            startIcon={<PlayArrowIcon />}
            onClick={() => void handleStart()}
            disabled={!canMutate || isBusy}
          >
            {savingAction === "start" ? <CircularProgress size={18} color="inherit" /> : startLabel}
          </Button>
        ) : null}
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

type GoalFormValues = {
  objective: string;
  tokenBudget: number | null;
};

type GoalFormResult =
  | { values: GoalFormValues; error: null }
  | { values: null; error: "objectiveRequired" | "budgetInvalid" };

/** Validates and normalizes the two editable goal fields before a mutation. */
function readGoalFormValues(objective: string, tokenBudget: string): GoalFormResult {
  const trimmedObjective = objective.trim();

  if (trimmedObjective.length === 0) {
    return { values: null, error: "objectiveRequired" };
  }

  const parsedBudget = readTokenBudget(tokenBudget);

  if (parsedBudget.error) {
    return { values: null, error: "budgetInvalid" };
  }

  return {
    values: {
      objective: trimmedObjective,
      tokenBudget: parsedBudget.value
    },
    error: null
  };
}

export const ChatGoalDialogX = observer(ChatGoalDialog);
