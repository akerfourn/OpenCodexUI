import { Alert, Box } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { DebugImportIssue } from "@open-codex-ui/opencodex-protocol";

/** Keeps dropped options and unresolved variables visible during preview and editing. */
export function DebugImportIssues({ issues }: { issues: readonly DebugImportIssue[] }) {
  const { t } = useTranslation();
  if (issues.length === 0) return null;
  const messages = [...new Set(issues.map(issue => t(`debug.import.issues.${issue.kind}`, { field: issue.field })))];
  return <Alert severity="warning">
    {t("debug.import.partialHelp")}
    <Box component="ul" sx={{ m: 0, pl: 2.5, overflowWrap: "anywhere" }}>
      {messages.map(message => <li key={message}>{message}</li>)}
    </Box>
  </Alert>;
}
export const DebugImportIssuesX = observer(DebugImportIssues);
