import { lazy, Suspense, useState } from "react";
import { observer } from "mobx-react-lite";
import { Accordion, AccordionDetails, AccordionSummary, Alert, Button, Checkbox,
  FormControlLabel, LinearProgress, Stack, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useTranslation } from "react-i18next";
import type { DebugConfiguration } from "@open-codex-ui/opencodex-protocol";
import { hasNodeAdvancedDraft, type DebugAdvancedDraft } from "../../stores/debug/debugAdvancedDraft";
import { DebugConfigurationField } from "./DebugConfigurationField";
import { DebugEnvironmentFieldsX } from "./DebugEnvironmentFields";

const DebugAdvancedJsonEditor = lazy(() => import("./DebugAdvancedJsonEditor")
  .then(module => ({ default: module.DebugAdvancedJsonEditorX })));

/** Keeps simple controls available while loading Monaco only when additional JSON is requested. */
export function DebugAdvancedFields({ draft, target, request, onChange }: {
  draft: DebugAdvancedDraft; target: DebugConfiguration["target"]; request: DebugConfiguration["request"];
  onChange(draft: DebugAdvancedDraft): void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [showJson, setShowJson] = useState(false);
  let nodeFields;
  if (target === "node" && request === "launch") {
    nodeFields = <>
      <DebugEnvironmentFieldsX rows={draft.environment} onChange={environment => onChange({ ...draft, environment })} />
      <DebugConfigurationField label={t("debug.advanced.envFile")} help={t("debug.advanced.envFileHelp")}
        value={draft.envFile} onChange={event => onChange({ ...draft, envFile: event.target.value })} />
      <DebugConfigurationField label={t("debug.advanced.runtimeArgs")} help={t("debug.advanced.runtimeArgsHelp")}
        value={draft.runtimeArgs} onChange={event => onChange({ ...draft, runtimeArgs: event.target.value })} />
      <FormControlLabel control={<Checkbox checked={draft.stopOnEntry}
        onChange={event => onChange({ ...draft, stopOnEntry: event.target.checked })} />}
        label={t("debug.advanced.stopOnEntry")} />
    </>;
  } else if (hasNodeAdvancedDraft(draft)) {
    nodeFields = <Alert severity="warning">
      {t("debug.advanced.nodeOnly")}
      <Button onClick={() => onChange({ ...draft, environment: [], envFile: "", runtimeArgs: "[]", stopOnEntry: false })}>
        {t("debug.advanced.clearNode")}
      </Button>
    </Alert>;
  }
  let editor;
  if (showJson && expanded) {
    editor = <Suspense fallback={<LinearProgress />}>
      <DebugAdvancedJsonEditor value={draft.json} onChange={json => onChange({ ...draft, json })} />
    </Suspense>;
  }
  return <Accordion expanded={expanded} onChange={(_event, value) => setExpanded(value)}>
    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
      <Typography>{t("debug.advanced.title")}</Typography>
    </AccordionSummary>
    <AccordionDetails><Stack spacing={2}>
      {nodeFields}
      <Typography variant="body2">{t("debug.advanced.jsonHelp")}</Typography>
      <Button onClick={() => setShowJson(value => !value)}>{t("debug.advanced.jsonButton")}</Button>
      {editor}
    </Stack></AccordionDetails>
  </Accordion>;
}
export const DebugAdvancedFieldsX = observer(DebugAdvancedFields);
