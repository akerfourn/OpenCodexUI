import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { OpenCodexProjectCommand, OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";
import type { ProjectStore } from "../../stores/project/ProjectStore";
import { ProjectCommandDialogX } from "./ProjectCommandDialog";
import { ProjectCommandRunRowX } from "./ProjectCommandRunRow";
import { ProjectCommandLogsDialogX } from "./ProjectCommandLogsDialog";
import type { ProjectCommandRunView } from "../../stores/project/ProjectCommandsStore";

/** Configures the project hook and reviews its exact script and destination before manual execution. */
export function WorkspacePreparationDialog({ project, workspace, sourceName, onClose }: {
  project: ProjectStore; workspace: OpenCodexProjectWorkspace; sourceName?: string; onClose(): void;
}) {
  const { t } = useTranslation();
  const store = project.commandsStore;
  // Freeze the destination when opening; a move or a source change requires a new review.
  const [target] = useState(() => ({ projectId: workspace.projectId, workspaceId: workspace.id,
    sourceId: workspace.sourceId, workspacePath: workspace.path }));
  const [commandId, setCommandId] = useState(project.project.preferences.workspacePreparation?.commandId ?? "");
  const [editing, setEditing] = useState(false);
  const [editedCommand, setEditedCommand] = useState<OpenCodexProjectCommand | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logsRun, setLogsRun] = useState<ProjectCommandRunView | null>(null);
  const command = store.commands.find(item => item.id === commandId);
  const savedId = project.project.preferences.workspacePreparation?.commandId ?? "";
  const changed = commandId !== savedId;
  const current = project.workspaces.workspaces.find(item => item.id === target.workspaceId);
  const stale = current === undefined || current.path !== target.workspacePath || current.sourceId !== target.sourceId
    || project.project.sourceId !== target.sourceId;
  const unavailable = stale || project.isReadOnlyFromCache || !store.isAvailable || current?.removedAt !== null
    || current?.movePending === true || current?.removalPending === true;
  const unsaved = project.files.hasUnsavedWorkspaceDocuments(target.workspaceId);
  const busy = starting || store.isSaving || store.isLoading;
  const runs = store.getRuns(commandId).filter(run => run.workspaceId === target.workspaceId && run.sourceId === target.sourceId);
  const running = runs.some(run => run.status === "running");

  useEffect(() => { void store.loadCommands(); }, [store]);

  /** Persists the selected command without executing it. */
  async function handleSave(): Promise<void> {
    setError(null);
    try { await store.setPreparationCommand(commandId || null); }
    catch (failure) { setError(String(failure)); }
  }
  /** Sends the script currently visible to the backend; changed definitions are rejected there. */
  async function handleRun(): Promise<void> {
    if (command === undefined || target.sourceId === null || unavailable || unsaved || busy || changed || running) return;
    setStarting(true);
    setError(null);
    try {
      await store.runPreparation({ ...target, sourceId: target.sourceId, command: {
        id: command.id, name: command.name, command: command.command, updatedAt: command.updatedAt,
        executionMode: command.executionMode, persistLogs: command.persistLogs
      } });
    } catch (failure) { setError(String(failure)); }
    finally { setStarting(false); }
  }
  /** Opens the existing command editor to create a hook without introducing a second script format. */
  function handleCreate(): void { setEditedCommand(null); setEditing(true); }
  /** Edits the selected project command; changes apply everywhere this command is used. */
  function handleEdit(): void { if (command !== undefined) { setEditedCommand(command); setEditing(true); } }

  const script = command === undefined ? null : <TextField label={t("workspacePreparation.script")}
    value={command.command} fullWidth multiline minRows={3} slotProps={{ input: { readOnly: true } }} />;
  const failure = error === null ? null : <Alert severity="error">{error}</Alert>;
  const unsavedNotice = unsaved ? <Alert severity="warning">{t("workspacePreparation.unsaved")}</Alert> : null;
  const unavailableNotice = unavailable ? <Alert severity="warning">{t("workspacePreparation.unavailable")}</Alert> : null;
  const missing = commandId !== "" && command === undefined && !store.isLoading
    ? <Alert severity="warning">{t("workspacePreparation.missing")}</Alert> : null;
  const missingOption = commandId !== "" && command === undefined
    ? <MenuItem value={commandId} disabled>{t("workspacePreparation.missing")}</MenuItem> : null;
  const editButton = command === undefined ? null : <Button disabled={busy || running} onClick={handleEdit}>
    {t("workspacePreparation.edit")}</Button>;
  const saveButton = changed ? <Button disabled={busy || unavailable || (commandId !== "" && command === undefined)} onClick={handleSave}>
    {t("workspacePreparation.save")}</Button> : null;
  const runRows = runs.map(run => <ProjectCommandRunRowX key={run.id} run={run} workspaceLabel={target.workspacePath}
    onCloseRun={store.closeRun} onStopRun={store.stopRun} onOpenLogs={setLogsRun} />);

  return <Dialog open fullWidth maxWidth="md" onClose={busy ? undefined : onClose}>
    <DialogTitle>{t("workspacePreparation.title")}</DialogTitle>
    <DialogContent>
      <Stack spacing={2} sx={{ pt: 1 }}>
        <Alert severity="info">{t("workspacePreparation.help")}</Alert>
        <TextField label={t("workspacePreparation.source")} value={sourceName ?? target.sourceId ?? ""} fullWidth
          slotProps={{ input: { readOnly: true } }} />
        <TextField label={t("workspaces.destination")} value={target.workspacePath} fullWidth
          slotProps={{ input: { readOnly: true } }} />
        <TextField select label={t("workspacePreparation.command")} value={commandId} disabled={busy || running}
          onChange={event => setCommandId(event.target.value)} helperText={t("workspacePreparation.commandHelp")}>
          <MenuItem value="">{t("workspacePreparation.none")}</MenuItem>
          {missingOption}
          {store.commands.map(item => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
        </TextField>
        <Stack direction="row" spacing={1}>
          <Button disabled={busy || unavailable} onClick={handleCreate}>{t("commands.add")}</Button>{editButton}
        </Stack>
        {script}{missing}{unavailableNotice}{unsavedNotice}{failure}{runRows}
      </Stack>
      <ProjectCommandDialogX command={editedCommand} commandsStore={store} open={editing} onClose={() => setEditing(false)} />
      <ProjectCommandLogsDialogX run={logsRun} open={logsRun !== null} onClose={() => setLogsRun(null)} />
    </DialogContent>
    <DialogActions>
      <Button disabled={busy} onClick={onClose}>{t("workspaces.close")}</Button>{saveButton}
      <Button disabled={busy || unavailable || unsaved || changed || command === undefined || running} onClick={handleRun}>
        {t("workspacePreparation.run")}</Button>
    </DialogActions>
  </Dialog>;
}
export const WorkspacePreparationDialogX = observer(WorkspacePreparationDialog);
