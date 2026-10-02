import { Button, Chip, MenuItem, Select, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { BrowserPermissionEntry, BrowserPermissionChange } from "@open-codex-ui/opencodex-protocol";

/** Displays plain DTO rules; inherited rules are read-only and explicitly labelled. */
export function BrowserPermissionsList({ entries, busy, onChange }: {
  entries: BrowserPermissionEntry[];
  busy: boolean;
  onChange?: (change: BrowserPermissionChange) => void;
}) {
  const { t } = useTranslation();
  if (entries.length === 0) {
    return <Typography variant="body2" color="text.secondary">{t("browserPermissions.empty")}</Typography>;
  }
  const rows = entries.map(entry => {
    let controls = <Chip size="small" label={t(`browserPermissions.${entry.decision}`)} />;
    if (onChange !== undefined) {
      controls = (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Select size="small" value={entry.decision} disabled={busy}
            inputProps={{ "aria-label": t("browserPermissions.decisionFor", { site: entry.pattern }) }}
            onChange={event => onChange({
              ...entry, decision: event.target.value as BrowserPermissionEntry["decision"]
            })}>
            <MenuItem value="allowed">{t("browserPermissions.allowed")}</MenuItem>
            <MenuItem value="denied">{t("browserPermissions.denied")}</MenuItem>
          </Select>
          <Button disabled={busy} onClick={() => onChange({ ...entry, decision: "reset" })}>
            {t("browserPermissions.reset")}
          </Button>
        </Stack>
      );
    }
    return (
      <Stack key={`${entry.pattern}:${entry.decision}`} direction={{ xs: "column", sm: "row" }}
        spacing={1} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between", py: 1 }}>
        <Typography variant="body2" sx={{ overflowWrap: "anywhere", minWidth: 0 }}>{entry.pattern}</Typography>
        {controls}
      </Stack>
    );
  });
  return <Stack divider={<span style={{ borderBottom: "1px solid", opacity: 0.15 }} />}>{rows}</Stack>;
}
