import { useApplicationErrorReporter } from "../app/applicationErrorContext";
import { useContext, useState, type MouseEvent, type ChangeEvent } from "react";
import {
  Button,
  CircularProgress,
  IconButton,
  MenuItem,
  Popover,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { MessageRenderingOverride } from "@open-codex-ui/opencodex-protocol";
import { MessageRenderingContext } from "./MessageRenderingContext";

/** Edits two independent inherited preferences without touching the message content. */
export function MessageRenderingSettings({ turnId, itemId, role }: {
  turnId: string; itemId: string; role: "user" | "assistant";
}) {
  const { t } = useTranslation();
  const value = useContext(MessageRenderingContext);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const reportError = useApplicationErrorReporter();
  if (value === null) return null;
  const { store, context } = value;
  const override = store.override(context, turnId, itemId);
  const defaults = store.defaults(role);
  const effective = store.resolve(context, turnId, itemId, role);
  const saving = store.pending.has(store.key(context, turnId, itemId));
  const loaded = store.loaded(context);
  const hasOverride = override.markdown !== null || override.math !== null;

  /** Retries failed initial reads when the user opens the settings. */
  function open(event: MouseEvent<HTMLElement>): void {
    setAnchor(event.currentTarget);
    void store.load(context).catch(() => undefined);
  }

  /** Stores explicit booleans or null for inheritance, preserving the other option. */
  async function change(field: keyof MessageRenderingOverride, event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const choice = event.target.value;
    const selected = choice === "default" ? null : choice === "true";
    try { await store.save(context, { turnId, itemId, ...override, [field]: selected }); }
    catch (reason) { reportError(reason); }
  }

  /** Explicit retry keeps a transient read failure recoverable without leaving the menu. */
  function retry(): void {
    void store.load(context).catch(() => undefined);
  }

  const failure = store.error(context);
  let retryAction = null;
  if (!loaded) retryAction = <Button size="small" onClick={retry}>{t("messageRendering.retry")}</Button>;

  let icon = <SettingsOutlinedIcon sx={{ fontSize: 15 }} />;
  if (saving || (anchor !== null && !loaded && failure === null)) icon = <CircularProgress size={15} />;
  const fields = (["markdown", "math"] as const).map(field => {
    const disabled = saving || !loaded || (field === "math" && !effective.markdown);
    const defaultLabel = defaults[field] ? t("messageRendering.enabled") : t("messageRendering.disabled");
    return <TextField key={field} select fullWidth size="small" label={t(`messageRendering.${field}`)}
      disabled={disabled} value={String(override[field] ?? "default")}
      onChange={(event: ChangeEvent<HTMLInputElement>) => { void change(field, event); }}>
      <MenuItem value="default">{t("messageRendering.inherit", { value: defaultLabel })}</MenuItem>
      <MenuItem value="true">{t("messageRendering.enabled")}</MenuItem>
      <MenuItem value="false">{t("messageRendering.disabled")}</MenuItem>
    </TextField>;
  });
  return <>
    <Tooltip title={t("messageRendering.title")}>
      <IconButton size="small" aria-label={t("messageRendering.title")}
        aria-haspopup="dialog" aria-expanded={anchor !== null} onClick={open}
        color={hasOverride ? "primary" : "default"} sx={{ height: 24, width: 24, p: 0.25 }}>
        {icon}
      </IconButton>
    </Tooltip>
    <Popover open={anchor !== null} anchorEl={anchor} onClose={() => setAnchor(null)}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}>
      <Stack role="dialog" aria-label={t("messageRendering.title")} spacing={2}
        sx={{ p: 2, width: 320, maxWidth: "90vw" }}>
        <Typography variant="subtitle2">{t("messageRendering.title")}</Typography>
        {fields}
        {retryAction}
        <Typography variant="caption" color="text.secondary">{t("messageRendering.description")}</Typography>
      </Stack>
    </Popover>
  </>;
}
export const MessageRenderingSettingsX = observer(MessageRenderingSettings);
