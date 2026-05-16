/**
 * Renders details for one experimental Codex plugin.
 */
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import RemoveCircleOutlineOutlinedIcon from "@mui/icons-material/RemoveCircleOutlineOutlined";
import {
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { PluginsStore } from "../../stores/PluginsStore";

type HomePluginDetailDialogProps = {
  store: PluginsStore;
};

/**
 * Renders plugin details in a dialog.
 *
 * @param props Component props.
 * @returns Rendered dialog.
 */
export function HomePluginDetailDialog({ store }: HomePluginDetailDialogProps) {
  const { t } = useTranslation();
  const detail = store.selectedPluginDetail;
  const plugin = detail?.summary ?? null;
  const isOpen = detail !== null;
  const isBusy = plugin === null ? false : store.isPluginBusy(plugin.id);
  const canInstall = plugin !== null &&
    !plugin.installed &&
    plugin.installPolicy === "available" &&
    plugin.availability === "available";
  const canUninstall = plugin !== null &&
    plugin.installed &&
    plugin.installPolicy !== "installedByDefault";

  function handleClose(): void {
    store.closePluginDetail();
  }

  function handleInstall(): void {
    if (plugin !== null) {
      void store.installPlugin(plugin);
    }
  }

  function handleUninstall(): void {
    if (plugin !== null) {
      void store.uninstallPlugin(plugin);
    }
  }

  const actionContent = plugin?.installed === true ? (
    <Button
      color="inherit"
      disabled={!canUninstall || isBusy}
      startIcon={isBusy ? <CircularProgress size={14} /> : <RemoveCircleOutlineOutlinedIcon />}
      onClick={handleUninstall}
    >
      {canUninstall ? t("plugins.uninstall") : t("plugins.installedByDefault")}
    </Button>
  ) : (
    <Button
      variant="contained"
      disabled={!canInstall || isBusy}
      startIcon={isBusy ? <CircularProgress color="inherit" size={14} /> : <AddOutlinedIcon />}
      onClick={handleInstall}
    >
      {t("plugins.install")}
    </Button>
  );

  return (
    <Dialog open={isOpen} maxWidth="md" fullWidth onClose={handleClose}>
      {detail !== null && plugin !== null ? (
        <>
          <DialogTitle>
            <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
              <Avatar src={plugin.logoUrl ?? undefined} variant="rounded">
                {plugin.displayName.slice(0, 1).toUpperCase()}
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6" component="div" noWrap>
                  {plugin.displayName}
                </Typography>
                <Typography variant="body2" color="text.secondary" noWrap>
                  {plugin.marketplaceDisplayName}
                </Typography>
              </Box>
            </Stack>
          </DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                {plugin.category !== null ? <Chip label={plugin.category} size="small" /> : null}
                {plugin.installed ? <Chip label={t("plugins.installed")} color="success" size="small" /> : null}
                {plugin.enabled ? <Chip label={t("plugins.enabled")} size="small" /> : null}
                {plugin.capabilities.map((capability) => (
                  <Chip key={capability} label={capability} size="small" variant="outlined" />
                ))}
              </Stack>

              <Typography variant="body2">
                {detail.description ?? plugin.longDescription ?? plugin.shortDescription ?? t("plugins.noDescription")}
              </Typography>

              <Divider />

              <Box>
                <Typography variant="subtitle2">{t("plugins.skills")}</Typography>
                {detail.skills.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">{t("plugins.noSkills")}</Typography>
                ) : (
                  <List dense disablePadding>
                    {detail.skills.map((skill) => (
                      <ListItem key={skill.name} disableGutters>
                        <ListItemText
                          primary={skill.displayName}
                          secondary={skill.shortDescription ?? skill.description}
                        />
                      </ListItem>
                    ))}
                  </List>
                )}
              </Box>

              <Box>
                <Typography variant="subtitle2">{t("plugins.integrations")}</Typography>
                {detail.apps.length === 0 && detail.mcpServers.length === 0 && detail.hooks.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">{t("plugins.noIntegrations")}</Typography>
                ) : (
                  <List dense disablePadding>
                    {detail.apps.map((app) => (
                      <ListItem key={`app:${app.id}`} disableGutters>
                        <ListItemText
                          primary={app.name}
                          secondary={app.description ?? (app.needsAuth ? t("plugins.needsAuth") : null)}
                        />
                      </ListItem>
                    ))}
                    {detail.mcpServers.map((server) => (
                      <ListItem key={`mcp:${server}`} disableGutters>
                        <ListItemText primary={server} secondary={t("plugins.mcpServer")} />
                      </ListItem>
                    ))}
                    {detail.hooks.map((hook) => (
                      <ListItem key={`hook:${hook.key}:${hook.eventName}`} disableGutters>
                        <ListItemText primary={hook.key} secondary={hook.eventName} />
                      </ListItem>
                    ))}
                  </List>
                )}
              </Box>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose}>{t("plugins.close")}</Button>
            {actionContent}
          </DialogActions>
        </>
      ) : null}
    </Dialog>
  );
}

export const HomePluginDetailDialogX = observer(HomePluginDetailDialog);
