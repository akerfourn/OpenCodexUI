/**
 * Renders application log cleanup options.
 */
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField
} from "@mui/material";
import { observer } from "mobx-react-lite";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexLogRetentionUnit } from "@open-codex-ui/opencodex-protocol";

import type { LogsStore } from "../../stores/LogsStore";

type HomeLogCleanupDialogProps = {
  store: LogsStore;
};

/**
 * Renders cleanup controls for persisted logs.
 *
 * @param props Component props.
 *
 * @returns Rendered cleanup dialog.
 */
export function HomeLogCleanupDialog({ store }: HomeLogCleanupDialogProps) {
  const { t } = useTranslation();

  function handleClose(): void {
    store.closeCleanupDialog();
  }

  function handleModeChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    store.setCleanupMode(event.target.value === "all" ? "all" : "olderThan");
  }

  function handleAmountChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    store.setCleanupAmount(Number(event.target.value));
  }

  function handleUnitChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    store.setCleanupUnit(event.target.value as OpenCodexLogRetentionUnit);
  }

  function handleSubmit(): void {
    void store.applyCleanup();
  }

  return (
    <Dialog open={store.cleanupDialogOpen} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("logs.cleanup")}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField select label={t("logs.cleanupMode")} value={store.cleanupMode} onChange={handleModeChange}>
            <MenuItem value="olderThan">{t("logs.cleanupOlderThan")}</MenuItem>
            <MenuItem value="all">{t("logs.cleanupAll")}</MenuItem>
          </TextField>
          {store.cleanupMode === "olderThan" ? (
            <Stack direction="row" spacing={1}>
              <TextField
                label={t("logs.cleanupAmount")}
                type="number"
                value={store.cleanupAmount}
                onChange={handleAmountChange}
                slotProps={{
                  htmlInput: { min: 1 }
                }}
                sx={{ width: 140 }}
              />
              <TextField
                select
                label={t("logs.cleanupUnit")}
                value={store.cleanupUnit}
                onChange={handleUnitChange}
                sx={{ minWidth: 180 }}
              >
                <MenuItem value="hours">{t("logs.units.hours")}</MenuItem>
                <MenuItem value="days">{t("logs.units.days")}</MenuItem>
                <MenuItem value="weeks">{t("logs.units.weeks")}</MenuItem>
                <MenuItem value="months">{t("logs.units.months")}</MenuItem>
              </TextField>
            </Stack>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button type="button" onClick={handleClose}>
          {t("logs.cancel")}
        </Button>
        <Button type="button" variant="contained" color="error" onClick={handleSubmit}>
          {t("logs.applyCleanup")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export const HomeLogCleanupDialogX = observer(HomeLogCleanupDialog);
