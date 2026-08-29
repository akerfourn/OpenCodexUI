/** Provides a small editor for the native Codex goal attached to a chat. */
import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
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

import type {
  OpenCodexFileSearchResult,
  OpenCodexSkillSearchResult,
  OpenCodexThreadGoal
} from "@open-codex-ui/opencodex-protocol";

import type { ChatStore } from "../../stores/chat/ChatStore";
import { ComposerPlainTextInput } from "../chat/ComposerPlainTextInput";
import { ChatGoalSummary } from "./ChatGoalSummary";

type ChatGoalDialogProps = {
  open: boolean;
  chatStore: ChatStore;
  canOpenFileLinks: boolean;
  onSearchFiles(query: string): Promise<OpenCodexFileSearchResult[]>;
  onSearchSkills(query: string): Promise<OpenCodexSkillSearchResult[]>;
  onOpenFileLink(href: string): void;
  onClose(): void;
};

/** Maximum objective length accepted by Codex's native goal implementation. */
export const MAX_GOAL_OBJECTIVE_CHARACTERS = 4_000;

/** Initial height of the goal editor before the user resizes it manually. */
const GOAL_EDITOR_MIN_HEIGHT_PX = 200;

/** Renders and edits the native goal state for one chat. */
export function ChatGoalDialog({
  open,
  chatStore,
  canOpenFileLinks,
  onSearchFiles,
  onSearchSkills,
  onOpenFileLink,
  onClose
}: ChatGoalDialogProps) {
  const { t } = useTranslation();
  const goalStore = chatStore.goal;
  const [objective, setObjective] = useState("");
  const [objectiveMarkdown, setObjectiveMarkdown] = useState("");
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
    const nextObjective = currentGoal?.objective ?? "";

    setObjective(nextObjective);
    setObjectiveMarkdown(nextObjective);
    setTokenBudget(
      currentGoal?.tokenBudget === null || currentGoal?.tokenBudget === undefined
        ? ""
        : String(currentGoal.tokenBudget)
    );
  }

  async function handleSave(): Promise<void> {
    const formValues = readGoalFormValues(objectiveMarkdown, tokenBudget);

    if (formValues.error !== null) {
      setValidationError(t(`goal.${formValues.error}`, {
        max: MAX_GOAL_OBJECTIVE_CHARACTERS
      }));
      return;
    }

    setValidationError(null);
    setSavingAction("save");

    try {
      await goalStore.save({
        objective: formValues.values.objective,
        status: goal?.status === "active" ? "active" : "paused",
        tokenBudget: formValues.values.tokenBudget
      });
    } finally {
      setSavingAction(null);
    }
  }

  async function handleStart(): Promise<void> {
    const formValues = readGoalFormValues(objectiveMarkdown, tokenBudget);

    if (formValues.error !== null) {
      setValidationError(t(`goal.${formValues.error}`, {
        max: MAX_GOAL_OBJECTIVE_CHARACTERS
      }));
      return;
    }

    setValidationError(null);
    setSavingAction("start");

    try {
      await goalStore.save({
        objective: formValues.values.objective,
        status: "active",
        tokenBudget: formValues.values.tokenBudget
      });
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
      setObjectiveMarkdown("");
      setTokenBudget("");
    }
  }

  async function handlePause(): Promise<void> {
    await goalStore.updateStatus("paused");
  }

  /** Updates the visible value and the Markdown payload produced by references. */
  function handleObjectiveChange(value: string, markdown: string): void {
    setObjective(value);
    setObjectiveMarkdown(markdown);
    setValidationError(null);
  }

  /** Keeps Enter available for line breaks instead of submitting the parent form. */
  function handleObjectiveKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Enter") {
      event.stopPropagation();
    }
  }

  const isBusy = goalStore.isLoading || goalStore.isSaving;
  const canStart = goal === null || goal.status !== "active";
  const startLabel = goalStore.hasStarted ? t("goal.resume") : t("goal.start");
  const objectiveCharacterCount = countGoalCharacters(objectiveMarkdown.trim());
  const isObjectiveTooLong = objectiveCharacterCount > MAX_GOAL_OBJECTIVE_CHARACTERS;
  const objectiveCharacterCountText = t("goal.objectiveCharacters", {
    count: objectiveCharacterCount,
    max: MAX_GOAL_OBJECTIVE_CHARACTERS
  });
  const objectiveCounterColor = isObjectiveTooLong ? "error.main" : "text.secondary";

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

          <Box>
            <Typography component="div" variant="body2" sx={{ mb: 0.75 }}>
              {t("goal.objective")}
            </Typography>
            <ComposerPlainTextInput
              value={objective}
              placeholder={t("goal.objectivePlaceholder")}
              canOpenFileLinks={canOpenFileLinks}
              resizeLabel={t("composer.resize")}
              disabled={!canMutate || isBusy}
              renderSuggestionsInPortal
              wrapperClassName="goal-objective-editor"
              editorMinHeight={GOAL_EDITOR_MIN_HEIGHT_PX}
              onChange={handleObjectiveChange}
              onSearchFiles={onSearchFiles}
              onSearchSkills={onSearchSkills}
              onOpenFileLink={onOpenFileLink}
              onKeyDown={handleObjectiveKeyDown}
            />
            <Stack spacing={0.25} sx={{ mt: 0.5 }}>
              <Typography
                variant="caption"
                sx={{ color: objectiveCounterColor, display: "block", textAlign: "right" }}
              >
                {objectiveCharacterCountText}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("goal.objectiveHint")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("goal.objectiveCharacterHint")}
              </Typography>
            </Stack>
          </Box>

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
  | {
      values: null;
      error: "objectiveRequired" | "objectiveTooLong" | "budgetInvalid";
    };

/** Validates and normalizes the two editable goal fields before a mutation. */
export function readGoalFormValues(objective: string, tokenBudget: string): GoalFormResult {
  const trimmedObjective = objective.trim();

  if (trimmedObjective.length === 0) {
    return { values: null, error: "objectiveRequired" };
  }

  if (countGoalCharacters(trimmedObjective) > MAX_GOAL_OBJECTIVE_CHARACTERS) {
    return { values: null, error: "objectiveTooLong" };
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

/** Counts Unicode code points, matching Codex's native character limit semantics. */
export function countGoalCharacters(value: string): number {
  return Array.from(value).length;
}

export const ChatGoalDialogX = observer(ChatGoalDialog);
