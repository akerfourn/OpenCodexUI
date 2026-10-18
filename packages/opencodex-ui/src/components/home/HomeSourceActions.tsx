import { IconButton, Stack, Tooltip } from "@mui/material";
import StarBorderOutlinedIcon from "@mui/icons-material/StarBorderOutlined";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import SyncOutlinedIcon from "@mui/icons-material/SyncOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { OpenCodexSource } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../../stores/RootStore";
import { BrowserPermissionsSourceButtonX } from "../browser/BrowserPermissionsSourceButton";

/** Keeps every source card's actions visible in the same compact vertical rail. */
export function HomeSourceActions({ source, root, isDefault, isSyncing, onDefault, onSync, onConfigure }: {
  source: OpenCodexSource; root: RootStore; isDefault: boolean; isSyncing: boolean;
  onDefault(): void; onSync(): void; onConfigure(): void;
}) {
  const { t } = useTranslation();
  const defaultLabel = isDefault ? t("sourcePermissions.defaultSource") : t("sources.setDefault");
  const star = isDefault ? <StarRoundedIcon fontSize="small" /> : <StarBorderOutlinedIcon fontSize="small" />;
  return <Stack spacing={0.25} sx={{ alignItems: "center", flex: "0 0 auto" }}>
    <Tooltip title={defaultLabel}>
      <span><IconButton size="small" aria-label={defaultLabel} aria-pressed={isDefault}
        disabled={isDefault} color="primary" onClick={onDefault}
        sx={{ "&.Mui-disabled": { color: "primary.main", opacity: 0.7 } }}>{star}</IconButton></span>
    </Tooltip>
    <Tooltip title={t("sources.sync")}>
      <span><IconButton size="small" aria-label={t("sources.sync")} disabled={isSyncing} onClick={onSync}>
        <SyncOutlinedIcon fontSize="small" sx={{
          animation: isSyncing ? "source-sync-spin 1s linear infinite" : "none",
          "@keyframes source-sync-spin": { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(-360deg)" } }
        }} />
      </IconButton></span>
    </Tooltip>
    <BrowserPermissionsSourceButtonX root={root} source={source} />
    <Tooltip title={t("sourcePermissions.configure")}>
      <IconButton size="small" aria-label={t("sourcePermissions.configure")} onClick={onConfigure}>
        <SettingsOutlinedIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  </Stack>;
}

export const HomeSourceActionsX = observer(HomeSourceActions);
