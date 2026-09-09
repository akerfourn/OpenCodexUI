/** Renders the project goal definition and execution detail dialog. */
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import PauseOutlinedIcon from "@mui/icons-material/PauseOutlined";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import type {
  OpenCodexFileSearchResult,
  OpenCodexProjectGoal,
  OpenCodexProjectGoalStatus,
  OpenCodexSkillSearchResult
} from "@open-codex-ui/opencodex-protocol";
import { observer } from "mobx-react-lite";
import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { RootStore } from "../../stores/RootStore";
import type { ProjectGoalsStore } from "../../stores/project/ProjectGoalsStore";
import type { ProjectStore } from "../../stores/project/ProjectStore";
import { ComposerPlainTextInput } from "../chat/ComposerPlainTextInput";
import {
  countGoalCharacters,
  MAX_GOAL_OBJECTIVE_CHARACTERS,
  readGoalFormValues
} from "../dialogs/ChatGoalDialog";
import { canOpenProjectFileLinks } from "../chat/projectFileLinkAccess";
import { formatProjectGoalDuration, isFinishedProjectGoalStatus } from "./projectGoalDisplay";
import { ProjectGoalDeleteDialog } from "./ProjectGoalDeleteDialog";

type ProjectGoalDialogProps = {
  open: boolean;
  goal: OpenCodexProjectGoal | null;
  goalsStore: ProjectGoalsStore;
  projectStore: ProjectStore;
  store: RootStore;
  onClose(): void;
  onLaunch(goal: OpenCodexProjectGoal): void;
  onPause(goal: OpenCodexProjectGoal): void;
};

const GOAL_EDITOR_MIN_HEIGHT_PX = 240;

/** Edits a draft or displays the immutable definition of a launched goal. */
export function ProjectGoalDialog({
  open,
  goal,
  goalsStore,
  projectStore,
  store,
  onClose,
  onLaunch,
  onPause
}: ProjectGoalDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [objectiveMarkdown, setObjectiveMarkdown] = useState("");
  const [tokenBudget, setTokenBudget] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const isNewGoal = goal === null;
  const isDefinitionEditable = goal === null || goal.launchedAt === null;
  const canEdit = !goal?.isArchived;
  const isBusy = goalsStore.isSaving;
  const canSave = name.trim().length > 0 && !isBusy && canEdit;
  const canArchive = goal !== null && !goal.isArchived && isFinishedProjectGoalStatus(goal.status);
  const canLaunch = goal !== null && !goal.isArchived && (
    goal.status === "draft" || goal.status === "paused"
  );
  const canPause = goal?.status === "active";

  useEffect(() => {
    if (!open) {
      return;
    }

    setName(goal?.name ?? "");
    setObjective(goal?.objective ?? "");
    setObjectiveMarkdown(goal?.objective ?? "");
    setTokenBudget(
      goal?.tokenBudget === null || goal?.tokenBudget === undefined
        ? ""
        : String(goal.tokenBudget)
    );
    setValidationError(null);
    setDeleteDialogOpen(false);
  }, [goal, open]);

  function handleObjectiveChange(value: string, markdown: string): void {
    setObjective(value);
    setObjectiveMarkdown(markdown);
    setValidationError(null);
  }

  function handleObjectiveKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Enter") {
      event.stopPropagation();
    }
  }

  async function handleSave(): Promise<void> {
    const formValues = readGoalFormValues(objectiveMarkdown, tokenBudget);

    if (formValues.error !== null) {
      setValidationError(t(`goal.${formValues.error}`, { max: MAX_GOAL_OBJECTIVE_CHARACTERS }));
      return;
    }

    if (!canSave) {
      return;
    }

    setValidationError(null);

    try {
      if (goal === null) {
        await goalsStore.createGoal({
          name,
          objective: formValues.values.objective,
          tokenBudget: formValues.values.tokenBudget
        });
      } else {
        const patch = isDefinitionEditable
          ? {
              name,
              objective: formValues.values.objective,
              tokenBudget: formValues.values.tokenBudget
            }
          : { name };
        await goalsStore.updateGoal(goal.id, patch);
      }

      onClose();
    } catch {
      // The store keeps the translated error visible in the panel and dialog state.
    }
  }

  async function handleDelete(): Promise<void> {
    if (goal === null || goal.launchedAt !== null) {
      return;
    }

    try {
      await goalsStore.deleteGoal(goal.id);
      setDeleteDialogOpen(false);
      onClose();
    } catch {
      // Keep the dialog open so the store error can be corrected or retried.
    }
  }

  async function handleArchive(): Promise<void> {
    if (goal === null) {
      return;
    }

    try {
      if (goal.isArchived) {
        await goalsStore.unarchiveGoal(goal.id);
      } else {
        await goalsStore.archiveGoal(goal.id);
      }
      onClose();
    } catch {
      // Keep the dialog open when the lifecycle transition is rejected.
    }
  }

  function handleLaunch(): void {
    if (goal !== null) {
      onLaunch(goal);
    }
  }

  function handlePause(): void {
    if (goal !== null) {
      onPause(goal);
    }
  }

  const objectiveCharacterCount = countGoalCharacters(objectiveMarkdown.trim());
  const objectiveCounterColor = objectiveCharacterCount > MAX_GOAL_OBJECTIVE_CHARACTERS
    ? "error.main"
    : "text.secondary";
  const currentStatus = goal === null ? null : t(`goals.status.${goal.status}`);
  const canOpenFileLinks = canOpenProjectFileLinks(store, projectStore.project.sourceId);
  const searchFiles = useCallback(
    async (query: string): Promise<OpenCodexFileSearchResult[]> => {
      return await searchProjectFiles(store, projectStore, query);
    },
    [projectStore, store]
  );
  const searchSkills = useCallback(
    async (query: string): Promise<OpenCodexSkillSearchResult[]> => {
      return await searchProjectSkills(store, projectStore, query);
    },
    [projectStore, store]
  );

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
        <DialogTitle>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Typography component="span" variant="h6" sx={{ minWidth: 0, flex: "1 1 auto" }}>
              {isNewGoal ? t("goals.createTitle") : goal.name}
            </Typography>
            {goal !== null ? <Chip size="small" color={readStatusColor(goal.status)} label={currentStatus} /> : null}
            {goal !== null ? (
              <Tooltip title={goal.isArchived ? t("goals.unarchive") : t("goals.archive")}>
                <span>
                  <IconButton
                    size="small"
                    aria-label={goal.isArchived ? t("goals.unarchive") : t("goals.archive")}
                    disabled={isBusy || (!goal.isArchived && !canArchive)}
                    onClick={() => void handleArchive()}
                  >
                    {goal.isArchived ? (
                      <UnarchiveOutlinedIcon fontSize="small" />
                    ) : (
                      <ArchiveOutlinedIcon fontSize="small" />
                    )}
                  </IconButton>
                </span>
              </Tooltip>
            ) : null}
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {goalsStore.errorMessage !== null ? (
              <Alert severity="error">{goalsStore.errorMessage}</Alert>
            ) : null}

            {goal !== null ? <ProjectGoalExecutionSummary goal={goal} /> : null}

            <TextField
              label={t("goals.nameLabel")}
              value={name}
              fullWidth
              autoFocus={isNewGoal}
              disabled={isBusy || !canEdit}
              onChange={(event) => setName(event.target.value)}
            />

            <Box>
              <Typography component="div" variant="body2" sx={{ mb: 0.75 }}>
                {t("goals.objectiveLabel")}
              </Typography>
              <ComposerPlainTextInput
                value={objective}
                placeholder={t("goals.objectivePlaceholder")}
                canOpenFileLinks={canOpenFileLinks}
                resizeLabel={t("composer.resize")}
                disabled={isBusy || !canEdit || !isDefinitionEditable}
                renderSuggestionsInPortal
                wrapperClassName="goal-objective-editor"
                wrapperStyle={{ width: "100%", maxWidth: "none" }}
                editorMinHeight={GOAL_EDITOR_MIN_HEIGHT_PX}
                onChange={handleObjectiveChange}
                onSearchFiles={searchFiles}
                onSearchSkills={searchSkills}
                onOpenFileLink={(href) => store.openExternalLink(href)}
                onKeyDown={handleObjectiveKeyDown}
              />
              <Box
                sx={{
                  display: "flex",
                  width: "100%",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 1,
                  mt: 0.5
                }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ minWidth: 0, flex: "1 1 auto" }}
                >
                  {t("goals.objectiveHint")}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    flex: "0 0 auto",
                    whiteSpace: "nowrap",
                    textAlign: "right",
                    color: objectiveCounterColor
                  }}
                >
                  {t("goals.objectiveCharacters", {
                    count: objectiveCharacterCount,
                    max: MAX_GOAL_OBJECTIVE_CHARACTERS
                  })}
                </Typography>
              </Box>
            </Box>

            <TextField
              label={t("goals.tokenBudgetLabel")}
              value={tokenBudget}
              placeholder={t("goals.tokenBudgetPlaceholder")}
              helperText={t("goals.tokenBudgetHint")}
              type="number"
              fullWidth
              disabled={isBusy || !canEdit || !isDefinitionEditable}
              slotProps={{ htmlInput: { min: 1, step: 1 } }}
              onChange={(event) => setTokenBudget(event.target.value)}
            />

            {validationError !== null ? <Alert severity="warning">{validationError}</Alert> : null}
            {!isDefinitionEditable && goal !== null ? (
              <Alert severity="info">{t("goals.definitionLocked")}</Alert>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          {goal !== null && goal.launchedAt === null ? (
            <Button
              color="error"
              startIcon={<DeleteOutlineOutlinedIcon />}
              disabled={isBusy || !canEdit}
              onClick={() => setDeleteDialogOpen(true)}
            >
              {t("goals.delete")}
            </Button>
          ) : null}
          <Box sx={{ flex: 1 }} />
          {canPause ? (
            <Button
              startIcon={<PauseOutlinedIcon />}
              disabled={isBusy}
              onClick={handlePause}
            >
              {t("goals.pause")}
            </Button>
          ) : null}
          {canLaunch ? (
            <Button
              variant="contained"
              startIcon={<PlayArrowOutlinedIcon />}
              disabled={isBusy}
              onClick={handleLaunch}
            >
              {goal.status === "paused" ? t("goals.resume") : t("goals.launch")}
            </Button>
          ) : null}
          <Button onClick={onClose}>{t("goals.close")}</Button>
          <Button
            variant="outlined"
            disabled={!canSave}
            onClick={() => void handleSave()}
          >
            {isBusy ? <CircularProgress size={18} color="inherit" /> : t("goals.save")}
          </Button>
        </DialogActions>
      </Dialog>
      <ProjectGoalDeleteDialog
        open={isDeleteDialogOpen}
        isSaving={isBusy}
        onCancel={() => setDeleteDialogOpen(false)}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
}

/** Renders execution-only metadata separately from the editable definition. */
function ProjectGoalExecutionSummary({ goal }: { goal: OpenCodexProjectGoal }) {
  const { t } = useTranslation();
  const details = [
    [t("goals.elapsedLabel"), formatProjectGoalDuration(goal.timeUsedSeconds, t)],
    [t("goals.tokensUsedLabel"), goal.tokensUsed.toLocaleString()],
    [t("goals.chatLabel"), goal.threadId ?? t("goals.noChat")]
  ];

  return (
    <Box className="project-goal-execution-summary">
      <Typography variant="subtitle2">{t("goals.executionTitle")}</Typography>
      {details.map(([label, value]) => (
        <Stack key={label} direction="row" spacing={1} sx={{ justifyContent: "space-between" }}>
          <Typography variant="body2" color="text.secondary">{label}</Typography>
          <Typography variant="body2" sx={{ textAlign: "right" }}>{value}</Typography>
        </Stack>
      ))}
    </Box>
  );
}

/** Maps project goal status to the MUI semantic color used in the dialog. */
function readStatusColor(
  status: OpenCodexProjectGoalStatus
): "default" | "primary" | "success" | "warning" | "error" {
  switch (status) {
    case "active":
      return "primary";
    case "paused":
      return "warning";
    case "complete":
      return "success";
    case "blocked":
    case "usageLimited":
    case "budgetLimited":
    case "error":
      return "error";
    default:
      return "default";
  }
}

/** Searches project files for the advanced goal editor. */
async function searchProjectFiles(
  store: RootStore,
  projectStore: ProjectStore,
  query: string
): Promise<OpenCodexFileSearchResult[]> {
  return await store.request<OpenCodexFileSearchResult[]>({
    type: "files.search",
    projectPath: projectStore.workspacePath,
    sourceId: projectStore.project.sourceId,
    query,
    limit: 8
  });
}

/** Searches project skills for the advanced goal editor. */
async function searchProjectSkills(
  store: RootStore,
  projectStore: ProjectStore,
  query: string
): Promise<OpenCodexSkillSearchResult[]> {
  return await store.request<OpenCodexSkillSearchResult[]>({
    type: "skills.search",
    projectPath: projectStore.workspacePath,
    sourceId: projectStore.project.sourceId,
    query,
    limit: 8
  });
}

export const ProjectGoalDialogX = observer(ProjectGoalDialog);
