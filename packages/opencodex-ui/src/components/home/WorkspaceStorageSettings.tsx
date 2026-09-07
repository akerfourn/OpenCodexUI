import { useState } from "react";
import { observer } from "mobx-react-lite";
import { Alert, Box, Button, Chip, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { OpenCodexWorkspaceRoot } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../../stores/RootStore";
import { WorkspaceRootDialogX } from "./WorkspaceRootDialog";

/** Application-level storage preferences remain partitioned by Codex source. */
export function WorkspaceStorageSettings({ store }: { store: RootStore }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<OpenCodexWorkspaceRoot | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settings = store.appStore.settingsStore;
  const roots = settings.settings.workspaceRoots ?? [];
  const entries = roots.map((root) => {
    const sourceName = store.sourcesStore.sources.find((source) => source.id === root.sourceId)?.name ?? root.sourceId;
    const defaultBadge = root.isDefault ? <Chip size="small" label={t("workspaceStorage.default")} /> : null;
    return (
      <Box key={root.id} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Typography variant="subtitle2">{root.label} · {sourceName}</Typography>{defaultBadge}
        </Stack>
        <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>{root.path}</Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
          <Button disabled={busy} onClick={() => handleEdit(root)}>{t("workspaceStorage.edit")}</Button>
          <Button disabled={busy || root.isDefault} onClick={() => void handleDefault(root)}>{t("workspaceStorage.makeDefault")}</Button>
          <Button disabled={busy} onClick={() => void handleRemove(root)}>{t("workspaceStorage.remove")}</Button>
        </Stack>
      </Box>
    );
  });
  const dialog = editing === undefined ? null : <WorkspaceRootDialogX store={store} initial={editing}
    onSave={handleSave} onClose={() => setEditing(undefined)} busy={busy} error={error} />;
  const failure = error === null || editing !== undefined ? null : <Alert severity="error">{error}</Alert>;

  /** Opens a fresh draft without leaking an earlier save error into the new dialog. */
  function handleEdit(root: OpenCodexWorkspaceRoot | null): void {
    setError(null);
    setEditing(root);
  }
  /** Saves changes only after backend validation and durable settings persistence. */
  async function persist(next: OpenCodexWorkspaceRoot[]): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      await settings.setWorkspaceRoots(next);
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return false;
    } finally {
      setBusy(false);
    }
  }
  /** The first storage location in a source becomes its default automatically. */
  async function handleSave(root: OpenCodexWorkspaceRoot): Promise<void> {
    const next = roots.filter((entry) => entry.id !== root.id).map((entry) => ({ ...entry }));
    const isDefault = root.isDefault || !next.some((entry) => entry.sourceId === root.sourceId);
    next.push({ ...root, isDefault });
    if (await persist(next)) setEditing(undefined);
  }
  /** Changes only this source's default while preserving defaults in every other source. */
  async function handleDefault(root: OpenCodexWorkspaceRoot): Promise<void> {
    await persist(roots.map((entry) => ({ ...entry,
      isDefault: entry.sourceId === root.sourceId ? entry.id === root.id : entry.isDefault })));
  }
  /** Removing a preference never touches files; another location inherits its default role. */
  async function handleRemove(root: OpenCodexWorkspaceRoot): Promise<void> {
    const next = roots.filter((entry) => entry.id !== root.id).map((entry) => ({ ...entry }));
    if (root.isDefault) {
      const replacement = next.find((entry) => entry.sourceId === root.sourceId);
      if (replacement !== undefined) replacement.isDefault = true;
    }
    await persist(next);
  }
  return (
    <Stack spacing={1}>
      <Typography variant="h6">{t("workspaceStorage.title")}</Typography>
      <Typography variant="body2" color="text.secondary">{t("workspaceStorage.description")}</Typography>
      {entries}{failure}{dialog}
      <Button disabled={busy || store.sourcesStore.sources.length === 0} onClick={() => handleEdit(null)}>
        {t("workspaceStorage.add")}
      </Button>
    </Stack>
  );
}
export const WorkspaceStorageSettingsX = observer(WorkspaceStorageSettings);
