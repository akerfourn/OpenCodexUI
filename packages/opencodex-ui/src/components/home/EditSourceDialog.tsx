import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Tab,
  Tabs,
  Alert,
  TextField
} from "@mui/material";
import { useState, type ChangeEvent, type FormEvent, type SyntheticEvent } from "react";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { OpenCodexCommandCandidate } from "@open-codex-ui/opencodex-protocol";
import { supportsBrowserPermissions } from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../../stores/RootStore";
import { SourceConfigurationFields, type SourceDraft } from "./sourceConfiguration";
import { SourcePermissionsStore } from "../../stores/app/SourcePermissionsStore";
import { SourcePermissionsPanelX } from "./SourcePermissionsPanel";
import { BrowserPermissionsStore } from "../../stores/app/BrowserPermissionsStore";
import { BrowserPermissionsPanelX } from "../browser/BrowserPermissionsPanel";

type EditSourceDialogProps = {
  open: boolean;
  sourceId: string;
  sourceName: string;
  name: string;
  draft: SourceDraft;
  store: RootStore;
  commandCandidates: OpenCodexCommandCandidate[];
  selectedCommand: string;
  isDefault: boolean;
  isDeleting: boolean;
  onNameChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void;
  onDraftChange(patch: Partial<SourceDraft>): void;
  onClose(): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
  onDelete(): void;
};

/** Renders the source editing form and its destructive-action entry point. */
export function EditSourceDialog({
  open,
  sourceId,
  sourceName,
  name,
  draft,
  store,
  commandCandidates,
  selectedCommand,
  isDefault,
  isDeleting,
  onNameChange,
  onDraftChange,
  onClose,
  onSubmit,
  onDelete
}: EditSourceDialogProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("connection");
  const [permissions] = useState(() => new SourcePermissionsStore(store, sourceId));
  const [browser] = useState(() => new BrowserPermissionsStore(store, { sourceId, threadId: null }));
  const canConnect = store.sourcesStore.isSourceReady(sourceId);
  const canConfigureBrowser = supportsBrowserPermissions(store.sourcesStore.findSource(sourceId));
  const busy = permissions.isSaving || browser.busy;

  /** Prevents dismissal while a native defaults mutation is in flight. */
  function handleClose(): void { if (!busy) onClose(); }
  /** Keeps connection changes and native defaults in separate forms. */
  function handleTab(_event: SyntheticEvent, value: string): void {
    if (busy) return;
    if (value === "connection" || value === "permissions" || (value === "browser" && canConfigureBrowser)) setTab(value);
  }

  let unavailableContent = null;
  if (!canConnect) unavailableContent = <Alert severity="info">{t("sourcePermissions.unavailable")}</Alert>;
  let content = (
    <Box component="form" onSubmit={onSubmit}>
      <DialogContent dividers>
        <Stack spacing={2}>
          {unavailableContent}
          <TextField autoFocus fullWidth size="small" value={name} label={t("sources.name")} onChange={onNameChange} />
          <SourceConfigurationFields draft={draft} onChange={onDraftChange} store={store}
            commandCandidates={commandCandidates} selectedCommand={selectedCommand} />
        </Stack>
      </DialogContent>
      <DialogActions>
        {!isDefault ? (
          <Button type="button" color="error" startIcon={<DeleteOutlineOutlinedIcon />}
            disabled={isDeleting} onClick={onDelete} sx={{ mr: "auto" }}>{t("sources.delete")}</Button>
        ) : null}
        <Button type="button" onClick={handleClose}>{t("sources.cancel")}</Button>
        <Button variant="contained" type="submit">{t("sources.save")}</Button>
      </DialogActions>
    </Box>
  );
  if (tab === "permissions") content = <SourcePermissionsPanelX permissions={permissions} root={store} onClose={handleClose} />;
  if (tab === "browser") content = <BrowserPermissionsPanelX state={browser} onClose={handleClose} />;
  let browserTab = null;
  if (canConfigureBrowser) browserTab = <Tab value="browser" label={t("browserPermissions.title")} disabled={!canConnect || busy} />;

  return (
    <Dialog open={open} fullWidth maxWidth="sm" onClose={handleClose} aria-labelledby="source-configuration-title">
      <DialogTitle id="source-configuration-title">{t("sourcePermissions.title", { name: sourceName })}</DialogTitle>
      <Tabs value={tab} onChange={handleTab} variant="scrollable" scrollButtons="auto" aria-label={t("sourcePermissions.configure")}>
        <Tab value="connection" label={t("sourcePermissions.connection")} disabled={busy} />
        <Tab value="permissions" label={t("sourcePermissions.permissions")} disabled={!canConnect || busy} />
        {browserTab}
      </Tabs>
      {content}
    </Dialog>
  );
}

export const EditSourceDialogX = observer(EditSourceDialog);
