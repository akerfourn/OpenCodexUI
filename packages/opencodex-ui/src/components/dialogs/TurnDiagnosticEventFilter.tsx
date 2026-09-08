/** Renders the in-memory event-type filter for a turn diagnostic. */
import {
  Button,
  Checkbox,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import { useTranslation } from "react-i18next";

type TurnDiagnosticEventFilterProps = {
  eventNames: string[];
  selectedEventNames: string[];
  visibleCount: number;
  totalCount: number;
  onChange(selectedEventNames: string[]): void;
  onShowAll(): void;
};

/** Displays event-type controls without changing the diagnostic itself. */
export function TurnDiagnosticEventFilter({
  eventNames,
  selectedEventNames,
  visibleCount,
  totalCount,
  onChange,
  onShowAll
}: TurnDiagnosticEventFilterProps) {
  const { t } = useTranslation();

  function handleChange(event: SelectChangeEvent<string[]>): void {
    const value = event.target.value;
    onChange(typeof value === "string" ? value.split(",") : value);
  }

  const filterLabel = selectedEventNames.length === eventNames.length
    ? t("turnDiagnostics.allEventTypes")
    : t("turnDiagnostics.selectedEventTypes", { count: selectedEventNames.length });

  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1}
      sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}
    >
      <Typography variant="caption" color="text.secondary">
        {t("turnDiagnostics.eventFilterSummary", {
          visible: visibleCount,
          total: totalCount
        })}
      </Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
        <FormControl size="small" sx={{ minWidth: 220, maxWidth: "100%" }}>
          <InputLabel id="turn-diagnostic-event-filter-label">
            {t("turnDiagnostics.eventTypes")}
          </InputLabel>
          <Select
            labelId="turn-diagnostic-event-filter-label"
            multiple
            value={selectedEventNames}
            label={t("turnDiagnostics.eventTypes")}
            onChange={handleChange}
            renderValue={() => filterLabel}
            MenuProps={{ slotProps: { paper: { sx: { maxHeight: 360 } } } }}
          >
            {eventNames.map((eventName) => (
              <MenuItem key={eventName} value={eventName}>
                <Checkbox checked={selectedEventNames.includes(eventName)} size="small" />
                <Typography
                  component="span"
                  variant="body2"
                  sx={{ fontFamily: "monospace", overflowWrap: "anywhere" }}
                >
                  {eventName}
                </Typography>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {selectedEventNames.length < eventNames.length ? (
          <Button size="small" onClick={onShowAll}>
            {t("turnDiagnostics.showAllEventTypes")}
          </Button>
        ) : null}
      </Stack>
    </Stack>
  );
}
