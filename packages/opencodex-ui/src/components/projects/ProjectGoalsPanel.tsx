/** Renders the project-scoped goal catalogue and native execution controls. */
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Stack,
  Tooltip,
  Typography
} from "@mui/material";
import type {
  OpenCodexProjectGoal,
  OpenCodexThreadGoal
} from "@open-codex-ui/opencodex-protocol";
import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { RootStore } from "../../stores/RootStore";
import type { ChatStore } from "../../stores/chat/ChatStore";
import type { ProjectStore } from "../../stores/project/ProjectStore";
import { ProjectGoalDialogX } from "./ProjectGoalDialog";
import { ProjectGoalRow } from "./ProjectGoalRow";

type ProjectGoalsPanelProps = {
  store: RootStore;
  projectStore: ProjectStore;
};

/** Renders catalogue CRUD, archive browsing, and current-chat goal execution. */
export function ProjectGoalsPanel({ store, projectStore }: ProjectGoalsPanelProps) {
  const { t } = useTranslation();
  const goalsStore = projectStore.goalsStore;
  const currentChat = projectStore.selectedChat;
  const [selectedGoal, setSelectedGoal] = useState<OpenCodexProjectGoal | null>(null);
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [launchCandidate, setLaunchCandidate] = useState<OpenCodexProjectGoal | null>(null);
  const [busyGoalId, setBusyGoalId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const importedProjectIdRef = useRef<string | null>(null);

  useEffect(() => {
    void goalsStore.loadGoals();
  }, [goalsStore, projectStore.project.id]);

  useEffect(() => {
    if (!goalsStore.hasLoaded || goalsStore.isLoading ||
      importedProjectIdRef.current === projectStore.project.id) {
      return;
    }

    importedProjectIdRef.current = projectStore.project.id;
    void importLoadedNativeGoals(projectStore, goalsStore).catch((error: unknown) => {
      setActionError(readErrorMessage(error));
    });
  }, [goalsStore, goalsStore.hasLoaded, goalsStore.isLoading, projectStore]);

  function handleCreate(): void {
    setActionError(null);
    setSelectedGoal(null);
    setDialogOpen(true);
  }

  function handleOpen(goal: OpenCodexProjectGoal): void {
    setActionError(null);
    setSelectedGoal(goal);
    setDialogOpen(true);
  }

  function handleCloseDialog(): void {
    setDialogOpen(false);
    setSelectedGoal(null);
  }

  function handleLaunch(goal: OpenCodexProjectGoal): void {
    setActionError(null);

    if (!canLaunchGoal(goal, currentChat)) {
      setActionError(readLaunchAvailabilityMessage(goal, currentChat, t));
      return;
    }

    setLaunchCandidate(goal);
  }

  function handleCloseLaunchConfirmation(): void {
    setLaunchCandidate(null);
  }

  async function handleConfirmLaunch(): Promise<void> {
    const goal = launchCandidate;
    const chat = currentChat;

    if (goal === null || chat === null) {
      return;
    }

    setBusyGoalId(goal.id);
    setActionError(null);

    try {
      await startProjectGoal(goal, chat, projectStore, goalsStore);
      setLaunchCandidate(null);
      setDialogOpen(false);
      setSelectedGoal(null);
    } catch (error) {
      setActionError(readErrorMessage(error));
    } finally {
      setBusyGoalId(null);
    }
  }

  async function handlePause(goal: OpenCodexProjectGoal): Promise<void> {
    const chat = currentChat;

    if (chat === null || goal.threadId !== chat.thread.id) {
      setActionError(t("goals.pauseRequiresCurrentChat"));
      return;
    }

    setBusyGoalId(goal.id);
    setActionError(null);

    try {
      await pauseProjectGoal(goal, chat, projectStore, goalsStore);
    } catch (error) {
      setActionError(readErrorMessage(error));
    } finally {
      setBusyGoalId(null);
    }
  }

  async function handleArchive(goal: OpenCodexProjectGoal): Promise<void> {
    await mutateCatalogueGoal(() => goalsStore.archiveGoal(goal.id));
  }

  async function handleUnarchive(goal: OpenCodexProjectGoal): Promise<void> {
    await mutateCatalogueGoal(() => goalsStore.unarchiveGoal(goal.id));
  }

  async function mutateCatalogueGoal(operation: () => Promise<OpenCodexProjectGoal>): Promise<void> {
    setActionError(null);

    try {
      await operation();
    } catch (error) {
      setActionError(readErrorMessage(error));
    }
  }

  function handleArchivedChange(event: React.ChangeEvent<HTMLInputElement>): void {
    void goalsStore.loadGoals(event.target.checked);
  }

  const goals = goalsStore.includeArchived ? goalsStore.goals : goalsStore.currentGoals;
  const isReadOnly = projectStore.isReadOnlyFromCache;

  return (
    <section className="project-goals-panel">
      <Stack className="project-goals-header" direction="row" spacing={1}>
        <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
          <Typography component="h2" variant="subtitle1">
            {t("goals.title")}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t("goals.description")}
          </Typography>
        </Box>
        <Tooltip title={t("goals.add")}>
          <span>
            <IconButton
              className="project-goal-add-button"
              size="small"
              aria-label={t("goals.add")}
              disabled={goalsStore.isSaving}
              onClick={handleCreate}
            >
              <AddOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      <Stack className="project-goals-controls" spacing={1}>
        <FormControlLabel
          control={(
            <Checkbox
              size="small"
              checked={goalsStore.includeArchived}
              onChange={handleArchivedChange}
            />
          )}
          label={t("goals.showArchived")}
        />
        {currentChat === null ? (
          <Typography variant="caption" color="text.secondary">
            {t("goals.selectChatToLaunch")}
          </Typography>
        ) : (
          <Typography variant="caption" color="text.secondary" noWrap>
            {t("goals.currentChat", { chat: readChatTitle(currentChat) })}
          </Typography>
        )}
      </Stack>

      <Box className="project-goals-content">
        {goalsStore.isLoading ? <CircularProgress size={18} /> : null}
        {goalsStore.errorMessage !== null && actionError === null ? (
          <Alert severity="error">{goalsStore.errorMessage}</Alert>
        ) : null}
        {actionError !== null ? <Alert severity="error">{actionError}</Alert> : null}
        {isReadOnly ? <Alert severity="info">{t("goals.sourceUnavailable")}</Alert> : null}
        {goals.length === 0 && !goalsStore.isLoading ? (
          <Stack spacing={1} sx={{ alignItems: "center", py: 2 }}>
            <FlagOutlinedIcon color="disabled" />
            <Typography variant="body2" color="text.secondary" align="center">
              {goalsStore.includeArchived ? t("goals.emptyWithArchive") : t("goals.empty")}
            </Typography>
            <Button size="small" variant="outlined" onClick={handleCreate}>
              {t("goals.add")}
            </Button>
          </Stack>
        ) : null}
        <Stack spacing={0.75}>
          {goals.map((goal) => (
            <ProjectGoalRow
              key={goal.id}
              goal={goal}
              currentChatId={currentChat?.thread.id ?? null}
              disabled={goalsStore.isSaving || busyGoalId !== null}
              onOpen={handleOpen}
              onLaunch={handleLaunch}
              onPause={handlePause}
              onArchive={handleArchive}
              onUnarchive={handleUnarchive}
            />
          ))}
        </Stack>
      </Box>

      <ProjectGoalDialogX
        open={isDialogOpen}
        goal={selectedGoal}
        goalsStore={goalsStore}
        projectStore={projectStore}
        store={store}
        onClose={handleCloseDialog}
        onLaunch={handleLaunch}
        onPause={handlePause}
      />
      <Dialog open={launchCandidate !== null} onClose={handleCloseLaunchConfirmation} fullWidth maxWidth="sm">
        <DialogTitle>{t("goals.launchConfirmTitle")}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t("goals.launchConfirmDescription", {
              goal: launchCandidate?.name ?? "",
              chat: currentChat === null ? "" : readChatTitle(currentChat)
            })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseLaunchConfirmation}>{t("goals.cancel")}</Button>
          <Button
            variant="contained"
            disabled={busyGoalId !== null || currentChat === null}
            onClick={() => void handleConfirmLaunch()}
          >
            {busyGoalId !== null ? <CircularProgress size={18} color="inherit" /> : t("goals.launch")}
          </Button>
        </DialogActions>
      </Dialog>
    </section>
  );
}

/** Verifies that a goal can be assigned to the currently selected chat. */
function canLaunchGoal(goal: OpenCodexProjectGoal, chat: ChatStore | null): boolean {
  if (chat === null || chat.sourceId === null || goal.isArchived) {
    return false;
  }

  if (goal.status !== "draft" && goal.status !== "paused") {
    return false;
  }

  if (goal.status === "paused" && goal.threadId !== chat.thread.id) {
    return false;
  }

  return !chat.runtime.isWorking && !chat.runtime.isStartingTurn && !chat.runtime.isRecovering;
}

/** Explains why a catalogue goal cannot start from the current chat. */
function readLaunchAvailabilityMessage(
  goal: OpenCodexProjectGoal,
  chat: ChatStore | null,
  translate: (key: string) => string
): string {
  if (chat === null) {
    return translate("goals.noCurrentChat");
  }

  if (chat.sourceId === null) {
    return translate("goals.noSource");
  }

  if (goal.status === "paused" && goal.threadId !== chat.thread.id) {
    return translate("goals.pausedOtherChat");
  }

  if (chat.runtime.isWorking || chat.runtime.isStartingTurn || chat.runtime.isRecovering) {
    return translate("goals.chatBusy");
  }

  return translate("goals.finishedCannotLaunch");
}

/** Starts or resumes a catalogue goal in one explicit current chat. */
async function startProjectGoal(
  goal: OpenCodexProjectGoal,
  chat: ChatStore,
  projectStore: ProjectStore,
  goalsStore: ProjectStore["goalsStore"]
): Promise<void> {
  await chat.goal.load(true);
  throwIfGoalError(chat);

  const nativeGoal = chat.goal.goal;

  if (nativeGoal !== null && isNativeGoalRunning(nativeGoal) && goal.threadId !== chat.thread.id) {
    throw new Error("The current chat already has a resumable native goal.");
  }

  if (nativeGoal !== null && !isNativeGoalRunning(nativeGoal)) {
    const cleared = await chat.goal.clear();

    if (!cleared) {
      throw new Error(chat.goal.error ?? "The previous native goal could not be cleared.");
    }
  }

  const saved = await chat.goal.save({
    objective: goal.objective,
    tokenBudget: goal.tokenBudget,
    status: "active"
  });

  if (!saved || chat.goal.goal === null) {
    throw new Error(chat.goal.error ?? "The native goal could not be started.");
  }

  await goalsStore.updateExecution(goal.id, createExecutionPatch(
    chat.goal.goal,
    "active",
    chat,
    projectStore,
    goal.launchedAt
  ));
}

/** Pauses the native goal and records its current counters in the catalogue. */
async function pauseProjectGoal(
  goal: OpenCodexProjectGoal,
  chat: ChatStore,
  projectStore: ProjectStore,
  goalsStore: ProjectStore["goalsStore"]
): Promise<void> {
  await chat.goal.load(true);
  throwIfGoalError(chat);

  if (chat.goal.goal === null) {
    throw new Error("The native goal is no longer available in the current chat.");
  }

  const saved = await chat.goal.updateStatus("paused");

  if (!saved || chat.goal.goal === null) {
    throw new Error(chat.goal.error ?? "The native goal could not be paused.");
  }

  await goalsStore.updateExecution(goal.id, createExecutionPatch(
    chat.goal.goal,
    "paused",
    chat,
    projectStore,
    goal.launchedAt
  ));
}

/** Creates a plain transport-safe execution patch from a native goal snapshot. */
function createExecutionPatch(
  nativeGoal: OpenCodexThreadGoal,
  status: "active" | "paused",
  chat: ChatStore,
  projectStore: ProjectStore,
  launchedAt: string | null
) {
  return {
    status,
    sourceId: chat.sourceId,
    threadId: chat.thread.id,
    workspaceId: projectStore.workspaceId ?? null,
    cwd: projectStore.workspacePath,
    tokensUsed: nativeGoal.tokensUsed,
    timeUsedSeconds: nativeGoal.timeUsedSeconds,
    launchedAt: launchedAt ?? new Date().toISOString(),
    lastSyncedAt: new Date().toISOString()
  };
}

/** Raises the native goal error captured during a source read. */
function throwIfGoalError(chat: ChatStore): void {
  if (chat.goal.error !== null) {
    throw new Error(chat.goal.error);
  }
}

/** Identifies native statuses that can still be resumed. */
function isNativeGoalRunning(goal: OpenCodexThreadGoal): boolean {
  return goal.status === "active" || goal.status === "paused";
}

/** Returns a stable title for confirmation text. */
function readChatTitle(chat: ChatStore): string {
  return chat.thread.customTitle ?? chat.thread.title ?? chat.thread.preview ?? chat.thread.id;
}

/** Converts unknown failures into text suitable for an inline panel alert. */
function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Imports native goals from loaded chats once when the project catalogue opens. */
async function importLoadedNativeGoals(
  projectStore: ProjectStore,
  goalsStore: ProjectStore["goalsStore"]
): Promise<void> {
  for (const chatStore of projectStore.chatsById.values()) {
    await goalsStore.importNativeGoal(chatStore);
  }
}

export const ProjectGoalsPanelX = observer(ProjectGoalsPanel);
