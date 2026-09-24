import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { DebugConfiguration, OpenCodexFileContext } from "@open-codex-ui/opencodex-protocol";
import type { DebugStore } from "../../stores/debug/DebugStore";

/** Edits the explicitly supported subset of js-debug parameters; never imports launch.json. */
export function DebugConfigurationDialog({ store, context, configuration, onClose }: {
  store: DebugStore; context: OpenCodexFileContext; configuration?: DebugConfiguration; onClose(): void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<DebugConfiguration>(() => ({ id: crypto.randomUUID(),
    name: "Node.js", adapter: "javascript", context: { ...context }, target: "node", request: "launch",
    program: "", cwd: ".", port: 9229, ...configuration }));
  const [args, setArgs] = useState(JSON.stringify(configuration?.args ?? []));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Updates plain draft data rather than observable transport objects. */
  function field(key: keyof DebugConfiguration, value: string | number): void {
    setDraft(previous => ({ ...previous, [key]: value }));
  }
  /** A failed save retains the entire configuration form. */
  async function save(): Promise<void> {
    setError(null); setSaving(true);
    try {
      const parsed: unknown = JSON.parse(args);
      if (!Array.isArray(parsed) || !parsed.every(item => typeof item === "string")) throw new Error(t("debug.argsError"));
      if (await store.saveConfiguration({ ...draft, args: parsed })) onClose();
      else setError(store.error);
    } catch (failure) { setError(String(failure)); }
    finally { setSaving(false); }
  }
  let targetFields;
  if (draft.target === "node" && draft.request === "launch") {
    targetFields = <>
      <TextField label={t("debug.program")} value={draft.program ?? ""} onChange={event => field("program", event.target.value)} />
      <TextField label={t("debug.arguments")} value={args} onChange={event => setArgs(event.target.value)} helperText={t("debug.argsHelp")} />
    </>;
  } else if (draft.target === "chrome") {
    let urlField = <TextField label={t("debug.url")} value={draft.url ?? ""} onChange={event => field("url", event.target.value)} />;
    if (draft.request === "attach") urlField = <TextField label={t("debug.urlFilter")} value={draft.urlFilter ?? ""}
      onChange={event => field("urlFilter", event.target.value)} helperText={t("debug.urlFilterHelp")} />;
    targetFields = <>{urlField}<TextField label={t("debug.webRoot")} value={draft.webRoot ?? "."}
      onChange={event => field("webRoot", event.target.value)} /></>;
  }
  let connectionField = <TextField label={t("debug.runtime")} value={draft.runtime ?? ""}
    onChange={event => field("runtime", event.target.value)} helperText={t("debug.runtimeHelp")} />;
  if (draft.request === "attach") connectionField = <TextField label={t("debug.port")} type="number"
    value={draft.port ?? ""} onChange={event => field("port", Number(event.target.value))} helperText={t("debug.loopback")} />;
  let errorContent;
  if (error) errorContent = <Alert severity="error">{error}</Alert>;
  return <Dialog open fullWidth maxWidth="sm" onClose={(_event, reason) => { if (reason !== "backdropClick" && !saving) onClose(); }}>
    <DialogTitle>{t("debug.configuration")}</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      {errorContent}
      <TextField label={t("debug.name")} value={draft.name} onChange={event => field("name", event.target.value)} />
      <TextField select label={t("debug.target")} value={draft.target} onChange={event => field("target", event.target.value)}>
        <MenuItem value="node">Node.js / TypeScript</MenuItem><MenuItem value="chrome">Chrome / JavaScript</MenuItem>
      </TextField>
      <TextField select label={t("debug.mode")} value={draft.request} onChange={event => field("request", event.target.value)}>
        <MenuItem value="launch">{t("debug.launch")}</MenuItem><MenuItem value="attach">{t("debug.attach")}</MenuItem>
      </TextField>
      {targetFields}{connectionField}
      <TextField label={t("debug.cwd")} value={draft.cwd ?? "."} onChange={event => field("cwd", event.target.value)} />
      <Alert severity="info">{t("debug.configScope", { path: context.workspacePath })}</Alert>
    </Stack></DialogContent>
    <DialogActions><Button onClick={onClose} disabled={saving}>{t("debug.cancel")}</Button>
      <Button onClick={() => void save()} disabled={saving || !draft.name.trim()}>{t("debug.save")}</Button></DialogActions>
  </Dialog>;
}
export const DebugConfigurationDialogX = observer(DebugConfigurationDialog);
