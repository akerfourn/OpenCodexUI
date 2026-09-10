/** Renders the severity filter for persisted application logs. */
import {
  Checkbox,
  FormControl,
  InputLabel,
  MenuItem,
  Select
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { OpenCodexLogType } from "@open-codex-ui/opencodex-protocol";

import type { LogsStore } from "../../stores/app/LogsStore";

const LOG_TYPES: OpenCodexLogType[] = ["error", "warning", "info"];

type HomeLogTypeFilterProps = {
  store: LogsStore;
};

/**
 * Renders a multi-select control for global log severities.
 *
 * @param props Component props.
 *
 * @returns Rendered severity filter.
 */
export function HomeLogTypeFilter({ store }: HomeLogTypeFilterProps) {
  const { t } = useTranslation();
  const selectedTypes = store.visibleLogTypes;
  const filterLabel = selectedTypes.length === LOG_TYPES.length
    ? t("logs.allTypes")
    : selectedTypes.length === 0
      ? t("logs.noTypesSelected")
      : t("logs.selectedTypes", { count: selectedTypes.length });

  function handleChange(event: SelectChangeEvent<string[]>): void {
    const value = event.target.value;
    const types = typeof value === "string" ? value.split(",") : value;
    store.setVisibleLogTypes(types as OpenCodexLogType[]);
  }

  return (
    <FormControl size="small" sx={{ minWidth: 220 }}>
      <InputLabel id="home-log-type-filter-label">{t("logs.typeFilter")}</InputLabel>
      <Select
        labelId="home-log-type-filter-label"
        multiple
        value={selectedTypes}
        label={t("logs.typeFilter")}
        onChange={handleChange}
        renderValue={() => filterLabel}
      >
        {LOG_TYPES.map((type) => (
          <MenuItem key={type} value={type}>
            <Checkbox checked={selectedTypes.includes(type)} size="small" />
            {t(`logs.types.${type}`)}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

export const HomeLogTypeFilterX = observer(HomeLogTypeFilter);
