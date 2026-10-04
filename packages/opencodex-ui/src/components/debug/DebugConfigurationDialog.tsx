import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { DebugConfiguration, DebugImportIssue, OpenCodexFileContext } from "@open-codex-ui/opencodex-protocol";
import type { DebugStore } from "../../stores/debug/DebugStore";
import { DebugConfigurationField } from "./DebugConfigurationField";
import { DebugImportIssuesX } from "./DebugImportIssues";
import { DebugAdvancedFieldsX } from "./DebugAdvancedFields";
import { createDebugAdvancedDraft, parseDebugAdvancedDraft } from "../../stores/debug/debugAdvancedDraft";

/** Edits supported js-debug parameters, including explicitly reviewed import drafts. */
export function DebugConfigurationDialog({ store, context, configuration, importIssues = [], onClose, onSaved }: {
  store: DebugStore; context: OpenCodexFileContext; configuration?: DebugConfiguration;
  importIssues?: DebugImportIssue[]; onClose(): void; onSaved?(id: string): void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<DebugConfiguration>(() => ({ id: crypto.randomUUID(),
    name: "Node.js", adapter: "javascript", context: { ...context }, target: "node", request: "launch",
    program: "", cwd: ".", port: 9229, ...configuration }));
  const [args, setArgs] = useState(JSON.stringify(configuration?.args ?? []));
  const [advanced, setAdvanced] = useState(() => createDebugAdvancedDraft(configuration?.advanced));
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
      const options = parseDebugAdvancedDraft(advanced, draft.target, draft.request);
      if (await store.saveConfiguration({ ...draft, args: parsed, advanced: options })) { onSaved?.(draft.id); onClose(); }
      else setError(store.error);
    } catch (failure) { setError(String(failure)); }
    finally { setSaving(false); }
  }
  let modeHelp = t("debug.help.launchNode");
  let runtimeHelp = t("debug.help.runtimeNode");
  let portHelp = t("debug.help.portNode");
  if (draft.target === "chrome") {
    modeHelp = t("debug.help.launchChrome");
    runtimeHelp = t("debug.help.runtimeChrome");
    portHelp = t("debug.help.portChrome");
  }
  if (draft.request === "attach") {
    modeHelp = t("debug.help.attach");
  }
  let targetFields;
  if (draft.target === "node" && draft.request === "launch") {
    targetFields = <>
      <DebugConfigurationField label={t("debug.program")}
        help={t("debug.help.program")} value={draft.program ?? ""}
        onChange={event => field("program", event.target.value)} />
      <DebugConfigurationField label={t("debug.arguments")}
        help={t("debug.help.arguments")} value={args}
        onChange={event => setArgs(event.target.value)} helperText={t("debug.argsHelp")} />
    </>;
  } else if (draft.target === "chrome") {
    let urlField = <DebugConfigurationField label={t("debug.url")}
      help={t("debug.help.url")} value={draft.url ?? ""}
      onChange={event => field("url", event.target.value)} />;
    if (draft.request === "attach") {
      urlField = <DebugConfigurationField label={t("debug.urlFilter")}
        help={t("debug.help.urlFilter")} value={draft.urlFilter ?? ""}
        onChange={event => field("urlFilter", event.target.value)} helperText={t("debug.urlFilterHelp")} />;
    }
    let browserArguments;
    if (draft.request === "launch") {
      browserArguments = <DebugConfigurationField label={t("debug.browserArguments")}
        help={t("debug.help.argumentsChrome")} value={args}
        onChange={event => setArgs(event.target.value)} helperText={t("debug.argsHelp")} />;
    }
    targetFields = <>
      {urlField}
      <DebugConfigurationField label={t("debug.webRoot")}
        help={t("debug.help.webRoot")} value={draft.webRoot ?? "."}
        onChange={event => field("webRoot", event.target.value)} />
      {browserArguments}
    </>;
  }
  let connectionField = <DebugConfigurationField label={t("debug.runtime")}
    help={runtimeHelp} value={draft.runtime ?? ""}
    onChange={event => field("runtime", event.target.value)} helperText={t("debug.runtimeHelp")} />;
  if (draft.request === "attach") {
    connectionField = <DebugConfigurationField label={t("debug.port")}
      help={portHelp} type="number" value={draft.port ?? ""}
      onChange={event => field("port", Number(event.target.value))} helperText={t("debug.loopback")} />;
  }
  let errorContent;
  if (error) errorContent = <Alert severity="error">{error}</Alert>;
  return <Dialog open fullWidth maxWidth="sm" onClose={(_event, reason) => { if (reason !== "backdropClick" && !saving) onClose(); }}>
    <DialogTitle>{t("debug.configuration")}</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      {errorContent}
      <DebugImportIssuesX issues={importIssues} />
      <DebugConfigurationField label={t("debug.name")}
        help={t("debug.help.name")} value={draft.name}
        onChange={event => field("name", event.target.value)} />
      <DebugConfigurationField select label={t("debug.target")}
        help={t("debug.help.target")} value={draft.target}
        onChange={event => field("target", event.target.value)}>
        <MenuItem value="node">{t("debug.targetNode")}</MenuItem>
        <MenuItem value="chrome">{t("debug.targetBrowser")}</MenuItem>
      </DebugConfigurationField>
      <DebugConfigurationField select label={t("debug.mode")}
        help={modeHelp} value={draft.request}
        onChange={event => field("request", event.target.value)}>
        <MenuItem value="launch">{t("debug.launch")}</MenuItem><MenuItem value="attach">{t("debug.attach")}</MenuItem>
      </DebugConfigurationField>
      {targetFields}{connectionField}
      <DebugConfigurationField label={t("debug.cwd")}
        help={t("debug.help.cwd")} value={draft.cwd ?? "."}
        onChange={event => field("cwd", event.target.value)} />
      <DebugAdvancedFieldsX draft={advanced} target={draft.target} request={draft.request} onChange={setAdvanced} />
      <Alert severity="info">{t("debug.configScope", { path: context.workspacePath })}</Alert>
    </Stack></DialogContent>
    <DialogActions><Button onClick={onClose} disabled={saving}>{t("debug.cancel")}</Button>
      <Button onClick={() => void save()} disabled={saving || !draft.name.trim()}>{t("debug.save")}</Button></DialogActions>
  </Dialog>;
}
export const DebugConfigurationDialogX = observer(DebugConfigurationDialog);
