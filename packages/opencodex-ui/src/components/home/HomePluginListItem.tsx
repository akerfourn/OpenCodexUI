/**
 * Renders one plugin row in the Home plugin marketplace.
 */
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import RemoveCircleOutlineOutlinedIcon from "@mui/icons-material/RemoveCircleOutlineOutlined";
import {
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  ListItem,
  ListItemAvatar,
  ListItemButton,
  Stack,
  Typography
} from "@mui/material";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexPluginSummary } from "@open-codex-ui/opencodex-protocol";

type HomePluginListItemProps = {
  plugin: OpenCodexPluginSummary;
  isBusy: boolean;
  onOpen(plugin: OpenCodexPluginSummary): void;
  onInstall(plugin: OpenCodexPluginSummary): void;
  onUninstall(plugin: OpenCodexPluginSummary): void;
};

/**
 * Renders a plugin summary row.
 *
 * @param props Component props.
 * @returns Rendered row.
 */
export function HomePluginListItem({
  plugin,
  isBusy,
  onOpen,
  onInstall,
  onUninstall
}: HomePluginListItemProps) {
  const { t } = useTranslation();
  const canInstall = !plugin.installed &&
    plugin.installPolicy === "available" &&
    plugin.availability === "available";
  const canUninstall = plugin.installed && plugin.installPolicy !== "installedByDefault";

  function handleOpen(): void {
    onOpen(plugin);
  }

  function handleInstall(event: MouseEvent<HTMLButtonElement>): void {
    event.stopPropagation();
    onInstall(plugin);
  }

  function handleUninstall(event: MouseEvent<HTMLButtonElement>): void {
    event.stopPropagation();
    onUninstall(plugin);
  }

  const actionContent = plugin.installed ? (
    <Button
      size="small"
      variant="outlined"
      color="inherit"
      disabled={!canUninstall || isBusy}
      startIcon={isBusy ? <CircularProgress size={14} /> : <RemoveCircleOutlineOutlinedIcon />}
      onClick={handleUninstall}
    >
      {canUninstall ? t("plugins.uninstall") : t("plugins.installedByDefault")}
    </Button>
  ) : (
    <Button
      size="small"
      variant="contained"
      disabled={!canInstall || isBusy}
      startIcon={isBusy ? <CircularProgress color="inherit" size={14} /> : <AddOutlinedIcon />}
      onClick={handleInstall}
    >
      {t("plugins.install")}
    </Button>
  );

  return (
    <ListItem
      disablePadding
      secondaryAction={actionContent}
      sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1 }}
    >
      <ListItemButton onClick={handleOpen} sx={{ pr: 18 }}>
        <ListItemAvatar>
          <Avatar src={plugin.logoUrl ?? undefined} variant="rounded">
            {plugin.displayName.slice(0, 1).toUpperCase()}
          </Avatar>
        </ListItemAvatar>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <Typography variant="subtitle2" noWrap>
              {plugin.displayName}
            </Typography>
            {plugin.installed ? (
              <Chip
                icon={<CheckCircleOutlineOutlinedIcon />}
                label={t("plugins.installed")}
                size="small"
                color="success"
                variant="outlined"
              />
            ) : null}
            {plugin.isFeatured ? <Chip label={t("plugins.featured")} size="small" /> : null}
            {plugin.category !== null ? <Chip label={plugin.category} size="small" variant="outlined" /> : null}
          </Stack>
          <Typography variant="body2" color="text.secondary" noWrap>
            {plugin.shortDescription ?? plugin.longDescription ?? t("plugins.noDescription")}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {plugin.marketplaceDisplayName}
          </Typography>
        </Box>
      </ListItemButton>
    </ListItem>
  );
}
