/**
 * Renders one Codex source card and its edit dialog.
 */
import CodeOutlinedIcon from "@mui/icons-material/CodeOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import SyncOutlinedIcon from "@mui/icons-material/SyncOutlined";
import UpdateOutlinedIcon from "@mui/icons-material/UpdateOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { observer } from "mobx-react-lite";
import { useEffect, useState, type ChangeEvent, type FormEvent, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { SelectProps } from "@mui/material/Select";

import type {
  OpenCodexCommandCandidate,
  OpenCodexSource,
  OpenCodexSourceColor,
  OpenCodexSourceCommandMode
} from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../../stores/RootStore";
import { SOURCE_COLOR_OPTIONS, getSourceBadgeSx, getSourceColorOption } from "./sourceColor";

type HomeSourceBoxProps = {
  source: OpenCodexSource;
  store: RootStore;
  isDefault: boolean;
  isEditing: boolean;
  onEdit(sourceId: string): void;
  onCloseEdit(): void;
};

/**
 * Renders one source summary card.
 *
 * @param props Component props.
 * @returns Rendered source card.
 */
export function HomeSourceBox({
  source,
  store,
  isDefault,
  isEditing,
  onEdit,
  onCloseEdit
}: HomeSourceBoxProps) {
  const { t } = useTranslation();
  const [nameDraft, setNameDraft] = useState(source.name);
  const [colorDraft, setColorDraft] = useState(source.settings.color);
  const [commandModeDraft, setCommandModeDraft] = useState(readCommandMode(source));
  const [commandDraft, setCommandDraft] = useState(readCommand(source) ?? "");
  const [hasLocalAccessDraft, setHasLocalAccessDraft] = useState(sourceHasLocalAccess(source));
  const [openFolderCommandDraft, setOpenFolderCommandDraft] = useState(
    readOpenFolderCommand(source) ?? ""
  );
  const [openFileCommandDraft, setOpenFileCommandDraft] = useState(
    readOpenFileCommand(source) ?? ""
  );
  const [presetMenuAnchor, setPresetMenuAnchor] = useState<HTMLElement | null>(null);
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
  const [isDeleteConfirmed, setIsDeleteConfirmed] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingCodex, setIsUpdatingCodex] = useState(false);
  const sourcesStore = store.sourcesStore;
  const isSyncing = sourcesStore.isSourceSyncing(source.id);

  useEffect(() => {
    setNameDraft(source.name);
    setColorDraft(source.settings.color);
    setCommandModeDraft(readCommandMode(source));
    setCommandDraft(readCommand(source) ?? "");
    setHasLocalAccessDraft(sourceHasLocalAccess(source));
    setOpenFolderCommandDraft(readOpenFolderCommand(source) ?? "");
    setOpenFileCommandDraft(readOpenFileCommand(source) ?? "");
  }, [
    source.settings.color,
    source.settings,
    source.name
  ]);

  function handleEdit(): void {
    onEdit(source.id);
  }

  function handleSyncSource(): void {
    sourcesStore.syncSource(source.id);
  }

  function handleUpdateCodex(): void {
    if (!source.codexUpdate.updateAvailable || isUpdatingCodex) {
      return;
    }

    setIsUpdatingCodex(true);
    void sourcesStore.updateCodexSource(source.id).finally(() => {
      setIsUpdatingCodex(false);
    });
  }

  function handleNameChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    setNameDraft(event.target.value);
  }

  function handleColorChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    setColorDraft(event.target.value as OpenCodexSourceColor);
  }

  function handleModeChange(event: ChangeEvent<HTMLInputElement>): void {
    const nextCommandMode = event.target.value as OpenCodexSourceCommandMode;
    setCommandModeDraft(nextCommandMode);

    if (nextCommandMode === "auto") {
      setHasLocalAccessDraft(true);
    }
  }

  function handleCommandChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    setCommandDraft(event.target.value);
  }

  function handleOpenFolderCommandChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ): void {
    setOpenFolderCommandDraft(event.target.value);
  }

  function handleOpenFileCommandChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ): void {
    setOpenFileCommandDraft(event.target.value);
  }

  function handleHasLocalAccessToggle(): void {
    setHasLocalAccessDraft((current) => !current);
  }

  function handlePresetMenuOpen(event: MouseEvent<HTMLButtonElement>): void {
    setPresetMenuAnchor(event.currentTarget);
  }

  function handlePresetMenuClose(): void {
    setPresetMenuAnchor(null);
  }

  function handleApplyVsCodePreset(): void {
    setOpenFolderCommandDraft("code %D");
    setOpenFileCommandDraft("code --goto %F:%L:%C");
    setPresetMenuAnchor(null);
  }

  function handlePickExecutable(): void {
    void sourcesStore.pickSourceExecutablePath().then((path) => {
      if (path !== null) {
        setCommandDraft(path);
        setCommandModeDraft("custom");
      }
    });
  }

  function handleUseCommandCandidate(command: string): void {
    setCommandDraft(command);
    setCommandModeDraft("custom");
  }

  function handleCloseEdit(): void {
    resetDeleteState();
    onCloseEdit();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const settings = commandModeDraft === "custom"
      ? {
          color: colorDraft,
          commandMode: commandModeDraft,
          command: commandDraft,
          hasLocalAccess: hasLocalAccessDraft,
          openFolderCommand: openFolderCommandDraft,
          openFileCommand: openFileCommandDraft
        }
      : {
          color: colorDraft,
          commandMode: commandModeDraft,
          command: null,
          openFolderCommand: openFolderCommandDraft,
          openFileCommand: openFileCommandDraft
        };

    sourcesStore.updateSource(source.id, {
      name: nameDraft,
      settings
    });
    onCloseEdit();
  }

  function handleDelete(): void {
    if (isDefault || isDeleting) {
      return;
    }

    if (source.associatedProjectCount > 0) {
      setIsDeleteConfirmationOpen(true);
      return;
    }

    void deleteSource();
  }

  function handleDeleteConfirmationToggle(): void {
    setIsDeleteConfirmed((current) => !current);
  }

  function handleCancelDelete(): void {
    resetDeleteState();
  }

  function handleConfirmDelete(): void {
    if (!isDeleteConfirmed) {
      return;
    }

    void deleteSource();
  }

  async function deleteSource(): Promise<void> {
    setIsDeleting(true);

    try {
      await sourcesStore.deleteSource(source.id);
      resetDeleteState();
      onCloseEdit();
    } finally {
      setIsDeleting(false);
    }
  }

  function resetDeleteState(): void {
    setIsDeleteConfirmationOpen(false);
    setIsDeleteConfirmed(false);
  }

  const renderColorValue: NonNullable<SelectProps["renderValue"]> = (selected) => {
    const selectedColor = getSourceColorOption(
      typeof selected === "string" ? (selected as OpenCodexSourceColor) : colorDraft
    );

    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
        <Box
          component="span"
          aria-hidden="true"
          sx={[
            getSourceBadgeSx(selectedColor.value),
            {
              borderRadius: 999,
              flex: "0 0 auto",
              height: 12,
              width: 12
            }
          ]}
        />
        <Typography variant="body2" noWrap>
          {t(selectedColor.labelKey)}
        </Typography>
      </Box>
    );
  };

  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        p: 2,
        "&:hover .source-edit-action": {
          opacity: 1
        },
        "& .source-edit-action:focus-visible": {
          opacity: 1
        }
      }}
    >
      <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, flex: "1 1 auto" }}>
          <Box
            component="span"
            aria-hidden="true"
            sx={[
              getSourceBadgeSx(source.settings.color),
              {
                borderRadius: 999,
                flex: "0 0 auto",
                height: 12,
                width: 12
              }
            ]}
          />
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="subtitle1"
              component="h3"
              noWrap
              sx={{ alignItems: "center", display: "flex", gap: 0.5 }}
            >
              {isDefault ? (
                <Tooltip title={t("sources.defaultSource")}>
                  <StarRoundedIcon color="warning" fontSize="small" />
                </Tooltip>
              ) : null}
              {source.name}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {source.resolvedCommand}
            </Typography>
            <Box
              sx={{
                alignItems: "center",
                color: source.codex.status === "ready" ? "success.main" : "warning.main",
                display: "flex",
                gap: 0.5,
                mt: 0.5
              }}
            >
              {source.codex.status === "ready" ? (
                <CheckCircleOutlineOutlinedIcon sx={{ fontSize: 16 }} />
              ) : (
                <WarningAmberOutlinedIcon sx={{ fontSize: 16 }} />
              )}
              <Typography variant="caption" noWrap>
                {getCodexStatusLabel(source.codex.status, source.codex.version, t)}
              </Typography>
            </Box>
            {source.codexUpdate.supported ? (
              <Box
                sx={{
                  alignItems: "center",
                  color: source.codexUpdate.updateAvailable ? "info.main" : "text.secondary",
                  display: "flex",
                  gap: 0.5,
                  mt: 0.25
                }}
              >
                <Typography variant="caption" noWrap>
                  {getCodexUpdateLabel(source, t)}
                </Typography>
                {source.codexUpdate.updateAvailable ? (
                  <Button
                    type="button"
                    size="small"
                    variant="text"
                    disabled={isUpdatingCodex || isSyncing}
                    startIcon={<UpdateOutlinedIcon fontSize="small" />}
                    onClick={handleUpdateCodex}
                    sx={{ minWidth: 0, py: 0 }}
                  >
                    {t("sources.updateCodex")}
                  </Button>
                ) : null}
              </Box>
            ) : null}
          </Box>
        </Box>
        <Tooltip title={t("sources.edit")}>
          <IconButton
            className="source-edit-action"
            size="small"
            aria-label={t("sources.edit")}
            onClick={handleEdit}
            sx={{ opacity: 0, transition: "opacity 120ms ease" }}
          >
            <EditOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={t("sources.sync")}>
          <span>
            <IconButton
              size="small"
              aria-label={t("sources.sync")}
              disabled={isSyncing}
              onClick={handleSyncSource}
            >
              <SyncOutlinedIcon
                fontSize="small"
                sx={{
                  animation: isSyncing ? "source-sync-spin 1s linear infinite" : "none",
                  "@keyframes source-sync-spin": {
                    from: { transform: "rotate(0deg)" },
                    to: { transform: "rotate(-360deg)" }
                  }
                }}
              />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      <Dialog open={isEditing} fullWidth maxWidth="sm" onClose={handleCloseEdit}>
        <Box component="form" onSubmit={handleSubmit}>
          <DialogTitle>{t("sources.editTitle")}</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              <TextField
                autoFocus
                fullWidth
                size="small"
                value={nameDraft}
                label={t("sources.name")}
                onChange={handleNameChange}
              />
              <TextField
                select
                fullWidth
                size="small"
                value={colorDraft}
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
                          {
                            borderRadius: 999,
                            flex: "0 0 auto",
                            height: 12,
                            width: 12
                          }
                        ]}
                      />
                      <Typography variant="body2">{t(option.labelKey)}</Typography>
                    </Box>
                  </MenuItem>
                ))}
              </TextField>
              <RadioGroup row value={commandModeDraft} onChange={handleModeChange}>
                <FormControlLabel value="auto" control={<Radio />} label={t("sources.auto")} />
                <FormControlLabel value="custom" control={<Radio />} label={t("sources.custom")} />
              </RadioGroup>
              <TextField
                size="small"
                value={source.resolvedCommand}
                label={t("sources.resolvedCommand")}
                disabled
              />
              {source.commandCandidates.length > 0 ? (
                <Stack spacing={1}>
                  <Typography variant="subtitle2">
                    {t("sources.detectedCommands")}
                  </Typography>
                  {source.commandCandidates.map((candidate) => (
                    <SourceCommandCandidateRow
                      key={candidate.command}
                      candidate={candidate}
                      selectedCommand={commandModeDraft === "custom" ? commandDraft : source.resolvedCommand}
                      onSelect={handleUseCommandCandidate}
                    />
                  ))}
                </Stack>
              ) : null}
              {commandModeDraft === "custom" ? (
                <Stack spacing={1}>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <TextField
                      size="small"
                      fullWidth
                      value={commandDraft}
                      label={t("sources.command")}
                      onChange={handleCommandChange}
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
                        checked={hasLocalAccessDraft}
                        onChange={handleHasLocalAccessToggle}
                      />
                    }
                    label={t("sources.customHasLocalAccess")}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {t("sources.customHasLocalAccessHelp")}
                  </Typography>
                </Stack>
              ) : null}
              <Stack spacing={1} sx={{ opacity: hasLocalAccessDraft ? 1 : 0.55 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Typography variant="subtitle2">
                    {t("sources.openers")}
                  </Typography>
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
                  value={openFolderCommandDraft}
                  label={t("sources.openFolderCommand")}
                  placeholder="code %D"
                  disabled={!hasLocalAccessDraft}
                  onChange={handleOpenFolderCommandChange}
                />
                <TextField
                  size="small"
                  fullWidth
                  value={openFileCommandDraft}
                  label={t("sources.openFileCommand")}
                  placeholder="code -g %F:%L:%C"
                  disabled={!hasLocalAccessDraft}
                  onChange={handleOpenFileCommandChange}
                />
              </Stack>
            </Stack>
          </DialogContent>
          <DialogActions>
            {!isDefault ? (
              <Button
                type="button"
                color="error"
                startIcon={<DeleteOutlineOutlinedIcon />}
                disabled={isDeleting}
                onClick={handleDelete}
                sx={{ mr: "auto" }}
              >
                {t("sources.delete")}
              </Button>
            ) : null}
            <Button type="button" onClick={handleCloseEdit}>
              {t("sources.cancel")}
            </Button>
            <Button variant="contained" type="submit">
              {t("sources.save")}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog open={isDeleteConfirmationOpen} fullWidth maxWidth="sm" onClose={handleCancelDelete}>
        <DialogTitle>{t("sources.deleteTitle")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {t("sources.deleteDescription", { count: source.associatedProjectCount })}
          </Typography>
          <FormControlLabel
            control={<Checkbox checked={isDeleteConfirmed} onChange={handleDeleteConfirmationToggle} />}
            label={t("sources.deleteConfirmCheckbox")}
          />
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={handleCancelDelete}>
            {t("sources.cancel")}
          </Button>
          <Button
            type="button"
            variant="contained"
            color="error"
            disabled={!isDeleteConfirmed || isDeleting}
            onClick={handleConfirmDelete}
          >
            {t("sources.delete")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export const HomeSourceBoxX = observer(HomeSourceBox);

type SourceCommandCandidateRowProps = {
  candidate: OpenCodexCommandCandidate;
  selectedCommand: string;
  onSelect(command: string): void;
};

function SourceCommandCandidateRow({
  candidate,
  selectedCommand,
  onSelect
}: SourceCommandCandidateRowProps) {
  const { t } = useTranslation();
  const isSelected = candidate.command === selectedCommand;

  function handleSelect(): void {
    onSelect(candidate.command);
  }

  return (
    <Box
      sx={{
        alignItems: "center",
        border: "1px solid",
        borderColor: isSelected ? "primary.main" : "divider",
        borderRadius: 1,
        display: "flex",
        gap: 1,
        minWidth: 0,
        p: 1
      }}
    >
      <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
        <Typography variant="body2" noWrap>
          {candidate.command}
        </Typography>
        <Typography
          variant="caption"
          color={candidate.codex.status === "ready" ? "success.main" : "warning.main"}
          noWrap
        >
          {getCodexStatusLabel(candidate.codex.status, candidate.codex.version, t)}
        </Typography>
      </Box>
      <Button
        type="button"
        size="small"
        variant={isSelected ? "contained" : "outlined"}
        onClick={handleSelect}
        sx={{ flex: "0 0 auto" }}
      >
        {isSelected ? t("sources.selectedCommandCandidate") : t("sources.useCommandCandidate")}
      </Button>
    </Box>
  );
}

/**
 * Reads the source command mode shown by the local/custom editor.
 *
 * @param source Source DTO.
 * @returns Editable command mode.
 */
function readCommandMode(source: OpenCodexSource): OpenCodexSourceCommandMode {
  return source.kind === "custom" ? "custom" : "auto";
}

/**
 * Reads the custom command from a source.
 *
 * @param source Source DTO.
 * @returns Custom command, or `null`.
 */
function readCommand(source: OpenCodexSource): string | null {
  return source.kind === "custom" ? source.settings.command : null;
}

/**
 * Checks whether a source exposes host-local paths to the UI.
 *
 * @param source Source DTO.
 * @returns Whether local openers and pickers are usable.
 */
function sourceHasLocalAccess(source: OpenCodexSource): boolean {
  if (source.kind === "local") {
    return true;
  }

  return source.kind === "custom" && source.settings.hasLocalAccess;
}

/**
 * Reads the source folder opener command when local access is available.
 *
 * @param source Source DTO.
 * @returns Folder opener command, or `null`.
 */
function readOpenFolderCommand(source: OpenCodexSource): string | null {
  if (!sourceHasLocalAccess(source)) {
    return null;
  }

  return source.kind === "local" || source.kind === "custom"
    ? source.settings.openFolderCommand
    : null;
}

/**
 * Reads the source file opener command when local access is available.
 *
 * @param source Source DTO.
 * @returns File opener command, or `null`.
 */
function readOpenFileCommand(source: OpenCodexSource): string | null {
  if (!sourceHasLocalAccess(source)) {
    return null;
  }

  return source.kind === "local" || source.kind === "custom"
    ? source.settings.openFileCommand
    : null;
}

function getCodexStatusLabel(
  status: "ready" | "outdated" | "unavailable",
  version: string | null,
  translate: ReturnType<typeof useTranslation>["t"]
): string {
  if (status === "ready") {
    return translate("sources.codexDetected", {
      version: version ?? translate("sources.unknownVersion")
    });
  }

  if (status === "outdated") {
    return translate("sources.codexOutdated", {
      version: version ?? translate("sources.unknownVersion")
    });
  }

  return translate("sources.codexUnavailable");
}

/**
 * Formats update availability for a Codex source.
 *
 * @param source Source DTO.
 * @param translate Translation function.
 * @returns User-visible update status.
 */
function getCodexUpdateLabel(
  source: OpenCodexSource,
  translate: ReturnType<typeof useTranslation>["t"]
): string {
  if (source.codexUpdate.updateAvailable) {
    return translate("sources.codexUpdateAvailable", {
      version: source.codexUpdate.latestVersion ?? translate("sources.unknownVersion")
    });
  }

  if (source.codexUpdate.message !== null && source.codexUpdate.latestVersion === null) {
    return translate("sources.codexUpdateUnknown");
  }

  return translate("sources.codexUpdateCurrent");
}
