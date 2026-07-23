/**
 * Shared source configuration draft and fields used by source creation and editing.
 */
import CodeOutlinedIcon from "@mui/icons-material/CodeOutlined";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import type {
  OpenCodexCommandCandidate,
  OpenCodexSource,
  OpenCodexSourceColor,
  OpenCodexSourceKind,
  OpenCodexSourceSettingsPatch
} from "@open-codex-ui/opencodex-protocol";
import { useState, type ChangeEvent, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import type { RootStore } from "../../stores/RootStore";
import { SOURCE_COLOR_OPTIONS, getSourceBadgeSx, getSourceColorOption } from "./sourceColor";

export type SourceDraft = {
  kind: OpenCodexSourceKind;
  color: OpenCodexSourceColor;
  command: string;
  hasLocalAccess: boolean;
  openFolderCommand: string;
  openFileCommand: string;
  distro: string;
  codexCommand: string;
  host: string;
  user: string;
  port: string;
  identityFile: string;
};

type SourceConfigurationFieldsProps = {
  draft: SourceDraft;
  onChange(patch: Partial<SourceDraft>): void;
  store: RootStore;
  commandCandidates?: OpenCodexCommandCandidate[];
  selectedCommand?: string | null;
};

type SourceKindSelectorProps = {
  value: OpenCodexSourceKind;
  onChange(kind: OpenCodexSourceKind): void;
};

const SOURCE_KIND_OPTIONS: Array<{
  value: OpenCodexSourceKind;
  labelKey: string;
  descriptionKey: string;
}> = [
  { value: "local", labelKey: "sources.kindLocal", descriptionKey: "sources.kindLocalDescription" },
  { value: "wsl", labelKey: "sources.kindWsl", descriptionKey: "sources.kindWslDescription" },
  { value: "ssh", labelKey: "sources.kindSsh", descriptionKey: "sources.kindSshDescription" },
  { value: "custom", labelKey: "sources.kindCustom", descriptionKey: "sources.kindCustomDescription" }
];

/**
 * Creates an empty draft for a source kind.
 *
 * @param kind Source kind to configure.
 * @returns Draft initialized with safe defaults.
 */
export function createSourceDraft(kind: OpenCodexSourceKind): SourceDraft {
  return {
    kind,
    color: "blue",
    command: "",
    hasLocalAccess: kind === "local",
    openFolderCommand: "",
    openFileCommand: "",
    distro: "",
    codexCommand: "codex",
    host: "",
    user: "",
    port: "",
    identityFile: ""
  };
}

/**
 * Converts an existing source into an editable draft.
 *
 * @param source Existing source.
 * @returns Draft containing the source settings.
 */
export function sourceToDraft(source: OpenCodexSource): SourceDraft {
  const draft = createSourceDraft(source.kind);
  draft.color = source.settings.color;

  if (source.kind === "local") {
    draft.openFolderCommand = source.settings.openFolderCommand ?? "";
    draft.openFileCommand = source.settings.openFileCommand ?? "";
    return draft;
  }

  if (source.kind === "custom") {
    draft.command = source.settings.command ?? "";
    draft.hasLocalAccess = source.settings.hasLocalAccess;
    draft.openFolderCommand = source.settings.openFolderCommand ?? "";
    draft.openFileCommand = source.settings.openFileCommand ?? "";
    return draft;
  }

  if (source.kind === "wsl") {
    draft.distro = source.settings.distro ?? "";
    draft.codexCommand = source.settings.codexCommand;
    return draft;
  }

  draft.host = source.settings.host;
  draft.user = source.settings.user ?? "";
  draft.port = source.settings.port === null ? "" : String(source.settings.port);
  draft.identityFile = source.settings.identityFile ?? "";
  draft.codexCommand = source.settings.codexCommand;
  return draft;
}

/**
 * Converts a source draft into the settings patch expected by the backend.
 *
 * @param draft Source configuration draft.
 * @returns Settings relevant to the selected source kind.
 */
export function buildSourceSettings(draft: SourceDraft): OpenCodexSourceSettingsPatch {
  if (draft.kind === "custom") {
    return {
      color: draft.color,
      commandMode: "custom",
      command: draft.command.trim(),
      hasLocalAccess: draft.hasLocalAccess,
      openFolderCommand: draft.openFolderCommand.trim() || null,
      openFileCommand: draft.openFileCommand.trim() || null
    };
  }

  if (draft.kind === "wsl") {
    return {
      color: draft.color,
      distro: draft.distro.trim() || null,
      codexCommand: draft.codexCommand.trim() || "codex"
    };
  }

  if (draft.kind === "ssh") {
    return {
      color: draft.color,
      host: draft.host.trim(),
      user: draft.user.trim() || null,
      port: draft.port.trim() ? Number(draft.port) : null,
      identityFile: draft.identityFile.trim() || null,
      codexCommand: draft.codexCommand.trim() || "codex"
    };
  }

  return {
    color: draft.color,
    commandMode: "auto",
    command: null,
    openFolderCommand: draft.openFolderCommand.trim() || null,
    openFileCommand: draft.openFileCommand.trim() || null
  };
}

/**
 * Validates the fields that cannot be meaningfully inferred by the backend.
 *
 * @param draft Source configuration draft.
 * @returns Translation key for the first validation error, or `null`.
 */
export function validateSourceDraft(draft: SourceDraft): string | null {
  if (draft.kind === "custom" && draft.command.trim().length === 0) {
    return "sources.validation.commandRequired";
  }

  if (draft.kind === "ssh") {
    if (draft.host.trim().length === 0) {
      return "sources.validation.hostRequired";
    }

    if (draft.port.trim().length > 0) {
      const port = Number(draft.port);

      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return "sources.validation.portInvalid";
      }
    }
  }

  return null;
}

/**
 * Renders the source type selector used before persisting a new source.
 *
 * @param props Selector value and change handler.
 * @returns Source kind selector.
 */
export function SourceKindSelector({ value, onChange }: SourceKindSelectorProps) {
  const { t } = useTranslation();

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange(event.target.value as OpenCodexSourceKind);
  }

  return (
    <RadioGroup value={value} onChange={handleChange}>
      {SOURCE_KIND_OPTIONS.map((option) => (
        <FormControlLabel
          key={option.value}
          value={option.value}
          control={<Radio />}
          label={
            <Box>
              <Typography variant="body2">{t(option.labelKey)}</Typography>
              <Typography variant="caption" color="text.secondary">
                {t(option.descriptionKey)}
              </Typography>
            </Box>
          }
          sx={{ alignItems: "flex-start", m: 0, py: 0.5 }}
        />
      ))}
    </RadioGroup>
  );
}

/**
 * Renders fields specific to the selected source kind.
 *
 * @param props Draft, update callback, backend store, and optional candidates.
 * @returns Source configuration fields.
 */
export function SourceConfigurationFields({
  draft,
  onChange,
  store,
  commandCandidates = [],
  selectedCommand = null
}: SourceConfigurationFieldsProps) {
  const { t } = useTranslation();
  const [presetMenuAnchor, setPresetMenuAnchor] = useState<HTMLElement | null>(null);
  const activeCommand = selectedCommand ?? (draft.kind === "custom" ? draft.command : null);

  function handleColorChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    onChange({ color: event.target.value as OpenCodexSourceColor });
  }

  function handlePickExecutable(): void {
    void store.sourcesStore.pickSourceExecutablePath().then((path: string | null) => {
      if (path !== null) {
        onChange({ command: path });
      }
    });
  }

  function handlePresetMenuOpen(event: MouseEvent<HTMLButtonElement>): void {
    setPresetMenuAnchor(event.currentTarget);
  }

  function handlePresetMenuClose(): void {
    setPresetMenuAnchor(null);
  }

  function handleApplyVsCodePreset(): void {
    onChange({
      openFolderCommand: "code %D",
      openFileCommand: "code --goto %F:%L:%C"
    });
    handlePresetMenuClose();
  }

  const renderColorValue = (selected: unknown) => {
    const selectedColor = getSourceColorOption(
      typeof selected === "string" ? (selected as OpenCodexSourceColor) : draft.color
    );

    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
        <Box
          component="span"
          aria-hidden="true"
          sx={[
            getSourceBadgeSx(selectedColor.value),
            { borderRadius: 999, flex: "0 0 auto", height: 12, width: 12 }
          ]}
        />
        <Typography variant="body2" noWrap>
          {t(selectedColor.labelKey)}
        </Typography>
      </Box>
    );
  };

  const hasLocalAccess = draft.kind === "local" || draft.hasLocalAccess;
  const canSelectDetectedCommand = draft.kind === "local" || draft.kind === "custom";

  function handleSelectCommandCandidate(command: string): void {
    if (draft.kind === "local") {
      onChange({ kind: "custom", command });
      return;
    }

    onChange({ command });
  }

  return (
    <Stack spacing={2}>
      <TextField
        select
        fullWidth
        size="small"
        value={draft.color}
        label={t("sources.color")}
        onChange={handleColorChange}
        slotProps={{ select: { renderValue: renderColorValue } }}
      >
        {SOURCE_COLOR_OPTIONS.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
              <Box
                component="span"
                aria-hidden="true"
                sx={[
                  getSourceBadgeSx(option.value),
                  { borderRadius: 999, flex: "0 0 auto", height: 12, width: 12 }
                ]}
              />
              <Typography variant="body2">{t(option.labelKey)}</Typography>
            </Box>
          </MenuItem>
        ))}
      </TextField>

      {draft.kind === "local" ? (
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary">
            {t("sources.localDescription")}
          </Typography>
          {commandCandidates.length > 0 ? (
            <Typography variant="caption" color="text.secondary">
              {t("sources.detectedCommandsHelp")}
            </Typography>
          ) : null}
        </Stack>
      ) : null}

      {canSelectDetectedCommand && commandCandidates.length > 0 ? (
        <Stack spacing={1}>
          <Typography variant="subtitle2">{t("sources.detectedCommands")}</Typography>
          {commandCandidates.map((candidate) => (
            <Box
              key={candidate.command}
              sx={{
                alignItems: "flex-start",
                border: "1px solid",
                borderColor: candidate.command === activeCommand ? "primary.main" : "divider",
                borderRadius: 1,
                display: "flex",
                gap: 1,
                minWidth: 0,
                p: 1
              }}
            >
              <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
                <Typography
                  variant="body2"
                  sx={{ overflowWrap: "anywhere", wordBreak: "normal" }}
                >
                  <PathWithBreaks value={candidate.command} />
                </Typography>
                {candidate.linkTarget !== null ? (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ overflowWrap: "anywhere", wordBreak: "normal" }}
                  >
                    {t("sources.linkTargetLabel")} <PathWithBreaks value={candidate.linkTarget} />
                  </Typography>
                ) : null}
                <Typography
                  variant="caption"
                  color={candidate.codex.status === "ready" ? "success.main" : "warning.main"}
                >
                  {getCodexStatusLabel(candidate, t)}
                </Typography>
              </Box>
              {candidate.command === activeCommand ? (
                <Typography
                  variant="caption"
                  color="primary.main"
                  sx={{ flex: "0 0 auto", fontWeight: 600, mt: 0.5 }}
                >
                  {t("sources.selectedCommandCandidate")}
                </Typography>
              ) : (
                <Button
                  type="button"
                  size="small"
                  variant="outlined"
                  onClick={() => handleSelectCommandCandidate(candidate.command)}
                  sx={{ flex: "0 0 auto", mt: 0.25 }}
                >
                  {t("sources.useCommandCandidate")}
                </Button>
              )}
            </Box>
          ))}
        </Stack>
      ) : null}

      {draft.kind === "custom" ? (
        <Stack spacing={1}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <TextField
              size="small"
              fullWidth
              value={draft.command}
              label={t("sources.command")}
              placeholder={t("sources.commandPlaceholder")}
              onChange={(event) => onChange({ command: event.target.value })}
            />
            <Button
              type="button"
              variant="outlined"
              startIcon={<FolderOpenOutlinedIcon />}
              onClick={handlePickExecutable}
              sx={{ flex: "0 0 auto" }}
            >
              {t("sources.pickExecutable")}
            </Button>
          </Stack>
          <FormControlLabel
            control={
              <Checkbox
                checked={draft.hasLocalAccess}
                onChange={(event) => onChange({ hasLocalAccess: event.target.checked })}
              />
            }
            label={t("sources.customHasLocalAccess")}
          />
          <Typography variant="caption" color="text.secondary">
            {t("sources.customHasLocalAccessHelp")}
          </Typography>
        </Stack>
      ) : null}

      {draft.kind === "wsl" ? (
        <Stack spacing={1.5}>
          <TextField
            size="small"
            fullWidth
            value={draft.distro}
            label={t("sources.wslDistro")}
            placeholder={t("sources.wslDistroPlaceholder")}
            helperText={t("sources.wslDistroHelp")}
            onChange={(event) => onChange({ distro: event.target.value })}
          />
          <TextField
            size="small"
            fullWidth
            value={draft.codexCommand}
            label={t("sources.remoteCodexCommand")}
            placeholder="codex"
            onChange={(event) => onChange({ codexCommand: event.target.value })}
          />
        </Stack>
      ) : null}

      {draft.kind === "ssh" ? (
        <Stack spacing={1.5}>
          <TextField
            required
            size="small"
            fullWidth
            value={draft.host}
            label={t("sources.sshHost")}
            placeholder={t("sources.sshHostPlaceholder")}
            onChange={(event) => onChange({ host: event.target.value })}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              size="small"
              fullWidth
              value={draft.user}
              label={t("sources.sshUser")}
              placeholder={t("sources.sshUserPlaceholder")}
              onChange={(event) => onChange({ user: event.target.value })}
            />
            <TextField
              size="small"
              type="number"
              value={draft.port}
              label={t("sources.sshPort")}
              placeholder="22"
              onChange={(event) => onChange({ port: event.target.value })}
              sx={{ minWidth: { sm: 120 } }}
            />
          </Stack>
          <TextField
            size="small"
            fullWidth
            value={draft.identityFile}
            label={t("sources.sshIdentityFile")}
            placeholder={t("sources.sshIdentityFilePlaceholder")}
            helperText={t("sources.sshIdentityFileHelp")}
            onChange={(event) => onChange({ identityFile: event.target.value })}
          />
          <TextField
            size="small"
            fullWidth
            value={draft.codexCommand}
            label={t("sources.remoteCodexCommand")}
            placeholder="codex"
            onChange={(event) => onChange({ codexCommand: event.target.value })}
          />
        </Stack>
      ) : null}

      {hasLocalAccess ? (
        <Stack spacing={1} sx={{ opacity: hasLocalAccess ? 1 : 0.55 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Typography variant="subtitle2">{t("sources.openers")}</Typography>
            <Tooltip title={t("sources.openersHelp")}>
              <HelpOutlineOutlinedIcon color="action" fontSize="small" />
            </Tooltip>
            <Tooltip title={t("sources.openersPresets")}>
              <IconButton
                size="small"
                aria-label={t("sources.openersPresets")}
                onClick={handlePresetMenuOpen}
              >
                <CodeOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={presetMenuAnchor}
              open={presetMenuAnchor !== null}
              onClose={handlePresetMenuClose}
            >
              <MenuItem onClick={handleApplyVsCodePreset}>
                {t("sources.openersPresetVsCode")}
              </MenuItem>
            </Menu>
          </Box>
          <TextField
            size="small"
            fullWidth
            value={draft.openFolderCommand}
            label={t("sources.openFolderCommand")}
            placeholder="code %D"
            disabled={!hasLocalAccess}
            onChange={(event) => onChange({ openFolderCommand: event.target.value })}
          />
          <TextField
            size="small"
            fullWidth
            value={draft.openFileCommand}
            label={t("sources.openFileCommand")}
            placeholder="code -g %F:%L:%C"
            disabled={!hasLocalAccess}
            onChange={(event) => onChange({ openFileCommand: event.target.value })}
          />
        </Stack>
      ) : null}
    </Stack>
  );
}

/**
 * Formats the status of one detected Codex command candidate.
 *
 * @param candidate Detected command candidate.
 * @param translate Translation function.
 * @returns Localized status label.
 */
function getCodexStatusLabel(
  candidate: OpenCodexCommandCandidate,
  translate: ReturnType<typeof useTranslation>["t"]
): string {
  if (candidate.codex.status === "ready" && candidate.codex.version !== null) {
    return translate("sources.codexDetected", { version: candidate.codex.version });
  }

  if (candidate.codex.status === "outdated" && candidate.codex.version !== null) {
    return translate("sources.codexOutdated", { version: candidate.codex.version });
  }

  return translate("sources.codexUnavailable");
}

/**
 * Adds browser line-break opportunities after filesystem separators.
 *
 * @param value Path or command to display.
 * @returns Rendered text with break opportunities.
 */
function PathWithBreaks({ value }: { value: string }) {
  return (
    <>
      {value.split(/([\\/])/).map((part, index) => (
        <span key={`${part}-${index}`}>
          {part}
          {/[\\/]/.test(part) ? <wbr /> : null}
        </span>
      ))}
    </>
  );
}
