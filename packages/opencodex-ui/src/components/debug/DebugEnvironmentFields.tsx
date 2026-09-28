import { observer } from "mobx-react-lite";
import { Button, Checkbox, FormControlLabel, IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import { useTranslation } from "react-i18next";
import type { DebugEnvironmentRow } from "../../stores/debug/debugAdvancedDraft";

/** Edits environment values without conflating empty strings and removal from the inherited environment. */
export function DebugEnvironmentFields({ rows, onChange }: {
  rows: DebugEnvironmentRow[]; onChange(rows: DebugEnvironmentRow[]): void;
}) {
  const { t } = useTranslation();
  /** Replaces a row by stable identity so renaming does not remount its input. */
  function change(id: string, patch: Partial<DebugEnvironmentRow>): void {
    onChange(rows.map(row => row.id === id ? { ...row, ...patch } : row));
  }
  /** Appends a blank editable row; validation runs before saving. */
  function add(): void {
    onChange([...rows, { id: crypto.randomUUID(), name: "", value: "", unset: false }]);
  }
  const fields = rows.map(row => <Stack key={row.id} spacing={0.5}>
    <Stack direction="row" spacing={1}>
      <TextField size="small" label={t("debug.advanced.envName")} value={row.name}
        onChange={event => change(row.id, { name: event.target.value })} sx={{ flex: 1 }} />
      <TextField size="small" label={t("debug.advanced.envValue")} value={row.value} disabled={row.unset}
        onChange={event => change(row.id, { value: event.target.value })} sx={{ flex: 1 }} />
      <Tooltip title={t("debug.advanced.removeEnv")}>
        <IconButton aria-label={t("debug.advanced.removeEnv")} onClick={() => onChange(rows.filter(item => item.id !== row.id))}>
          <DeleteOutlineIcon />
        </IconButton>
      </Tooltip>
    </Stack>
    <FormControlLabel control={<Checkbox checked={row.unset}
      onChange={event => change(row.id, { unset: event.target.checked })} />}
      label={t("debug.advanced.unsetEnv")} />
  </Stack>);
  return <Stack spacing={1}>
    <Typography variant="subtitle2">{t("debug.advanced.environment")}</Typography>
    {fields}
    <Button onClick={add} disabled={rows.length >= 1000}>{t("debug.advanced.addEnv")}</Button>
  </Stack>;
}
export const DebugEnvironmentFieldsX = observer(DebugEnvironmentFields);
