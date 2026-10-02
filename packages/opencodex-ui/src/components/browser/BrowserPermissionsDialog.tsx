import { useEffect, useMemo, useState, type FormEvent } from "react";
import { observer } from "mobx-react-lite";
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { browserPermissionResources, type BrowserPermissionChange,
  type BrowserPermissionResource, type BrowserPermissionDecision } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../../stores/RootStore";
import { BrowserPermissionsStore } from "../../stores/app/BrowserPermissionsStore";
import { BrowserPermissionsList } from "./BrowserPermissionsList";

/** Edits either one source's global permissions or one chat's saved decisions. */
export function BrowserPermissionsDialog({ root, sourceId, threadId, onClose }: {
  root: RootStore;
  sourceId: string;
  threadId: string | null;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const state = useMemo(() => new BrowserPermissionsStore(root, { sourceId, threadId }), [root, sourceId, threadId]);
  const [resource, setResource] = useState<BrowserPermissionResource>("origins");
  const [pattern, setPattern] = useState("");
  const [decision, setDecision] = useState<BrowserPermissionDecision>("allowed");
  useEffect(() => { void state.load(); }, [state]);

  /** Applies an explicit row edit without converting inherited global permissions. */
  function handleChange(change: BrowserPermissionChange): void { void state.change(change); }
  /** Adds a rule only after the user has supplied its site or pattern. */
  function handleAdd(event: FormEvent): void {
    event.preventDefault();
    const site = pattern.trim();
    if (site.length === 0 || state.busy) return;
    void state.change({ resource, pattern: site, decision }).then(() => {
      if (state.errorKey === null) setPattern("");
    });
  }
  /** Refreshes from disk after a conflict or a browser prompt changed the file. */
  function handleRefresh(): void { void state.load(); }
  /** Requests the backend-guarded reload only after the user selects it. */
  function handleReload(): void { void state.reloadConnection(); }

  let content = <CircularProgress size={24} />;
  if (state.snapshot !== null) {
    const entries = state.snapshot.file.entries.filter(entry => entry.resource === resource)
      .map(entry => ({ resource: entry.resource, pattern: entry.pattern, decision: entry.decision }));
    const globalEntries = state.snapshot.global?.entries.filter(entry => entry.resource === resource)
      .map(entry => ({ resource: entry.resource, pattern: entry.pattern, decision: entry.decision })) ?? [];
    let inherited = null;
    if (threadId !== null) {
      inherited = (
        <Box component="section" sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 2 }}>
          <Typography variant="subtitle2">{t("browserPermissions.inherited")}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t("browserPermissions.precedence")}
          </Typography>
          <BrowserPermissionsList entries={globalEntries} busy={state.busy} />
        </Box>
      );
    }
    content = (
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">{t("browserPermissions.description")}</Typography>
        <FormControl size="small" fullWidth>
          <InputLabel id="browser-permission-resource">{t("browserPermissions.resource")}</InputLabel>
          <Select value={resource} labelId="browser-permission-resource" label={t("browserPermissions.resource")}
            onChange={event => setResource(event.target.value as BrowserPermissionResource)}>
            {browserPermissionResources.map(value => (
              <MenuItem key={value} value={value}>{t(`browserPermissions.resources.${value}`)}</MenuItem>
            ))}
          </Select>
        </FormControl>
        {inherited}
        <Box component="section">
          <Typography variant="subtitle2">
            {t(threadId === null ? "browserPermissions.globalRules" : "browserPermissions.chatRules")}
          </Typography>
          <BrowserPermissionsList entries={entries} busy={state.busy} onChange={handleChange} />
        </Box>
        <Stack component="form" spacing={1} onSubmit={handleAdd}>
          <TextField size="small" label={t("browserPermissions.site")} value={pattern} disabled={state.busy}
            placeholder="https://example.org" helperText={t("browserPermissions.siteHelp")}
            slotProps={{ htmlInput: { maxLength: 2048 } }} onChange={event => setPattern(event.target.value)} />
          <Stack direction="row" spacing={1}>
            <Select size="small" value={decision} disabled={state.busy}
              inputProps={{ "aria-label": t("browserPermissions.decision") }}
              onChange={event => setDecision(event.target.value as BrowserPermissionDecision)}>
              <MenuItem value="allowed">{t("browserPermissions.allowed")}</MenuItem>
              <MenuItem value="denied">{t("browserPermissions.denied")}</MenuItem>
            </Select>
            <Button type="submit" variant="outlined" disabled={state.busy || pattern.trim().length === 0}>
              {t("browserPermissions.add")}
            </Button>
          </Stack>
        </Stack>
      </Stack>
    );
  } else if (!state.busy) {
    content = <Typography variant="body2">{t("browserPermissions.notLoaded")}</Typography>;
  }
  let error = null;
  if (state.errorKey !== null) {
    error = (
      <Alert severity="error" sx={{ mb: 2 }}>
        {t(state.errorKey)}
        <Typography variant="caption" component="div" sx={{ overflowWrap: "anywhere" }}>
          {state.errorDetail}
        </Typography>
      </Alert>
    );
  }
  let reloadNotice = null;
  if (state.needsReload) {
    reloadNotice = <Alert severity="info" sx={{ mt: 2 }}>{t("browserPermissions.reloadNotice")}</Alert>;
  }
  return (
    <Dialog open fullWidth maxWidth="sm" onClose={state.busy ? undefined : onClose}>
      <DialogTitle>
        {t(threadId === null ? "browserPermissions.sourceTitle" : "browserPermissions.chatTitle")}
      </DialogTitle>
      <DialogContent>{error}{content}{reloadNotice}</DialogContent>
      <DialogActions>
        <Button disabled={state.busy || state.snapshot === null} onClick={handleReload}>
          {t("browserPermissions.reload")}
        </Button>
        <Button disabled={state.busy} onClick={handleRefresh}>{t("browserPermissions.refresh")}</Button>
        <Button disabled={state.busy} onClick={onClose}>{t("browserPermissions.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}

export const BrowserPermissionsDialogX = observer(BrowserPermissionsDialog);
