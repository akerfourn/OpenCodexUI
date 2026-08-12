/**
 * Renders one Codex source card and its edit dialog.
 */
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import AutorenewOutlinedIcon from "@mui/icons-material/AutorenewOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import StarBorderOutlinedIcon from "@mui/icons-material/StarBorderOutlined";
import SyncOutlinedIcon from "@mui/icons-material/SyncOutlined";
import UpdateOutlinedIcon from "@mui/icons-material/UpdateOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexSource
} from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../../stores/RootStore";
import { DeleteSourceDialog } from "./DeleteSourceDialog";
import { EditSourceDialog } from "./EditSourceDialog";
import { getSourceBadgeSx } from "./sourceColor";
import {
  buildSourceSettings,
  sourceToDraft,
  type SourceDraft
} from "./sourceConfiguration";
import {
  getCodexStatusLabel,
  getCodexUpdateLabel,
  getSourceKindLabelKey
} from "./sourcePresentation";
import { UsageResetCreditsDialogX } from "./UsageResetCreditsDialog";

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
  const [draft, setDraft] = useState<SourceDraft>(() => sourceToDraft(source));
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
  const [isDeleteConfirmed, setIsDeleteConfirmed] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingCodex, setIsUpdatingCodex] = useState(false);
  const [isResetCreditsDialogOpen, setIsResetCreditsDialogOpen] = useState(false);
  const sourcesStore = store.sourcesStore;
  const usageState = store.usageStore.getSourceUsage(source.id);
  const resetCredits = usageState?.rateLimitResetCredits;
  const isSyncing = sourcesStore.isSourceSyncing(source.id);

  useEffect(() => {
    setNameDraft(source.name);
    setDraft(sourceToDraft(source));
  }, [source]);

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

  function handleSetDefaultSource(): void {
    store.appStore.settingsStore.setDefaultSourceId(source.id);
  }

  function handleOpenResetCredits(): void {
    if (resetCredits === undefined || resetCredits === null || resetCredits.availableCount <= 0) {
      return;
    }

    setIsResetCreditsDialogOpen(true);
  }

  function handleCloseResetCredits(): void {
    setIsResetCreditsDialogOpen(false);
  }

  function handleRefreshResetCredits(): void {
    void store.usageStore.load(source.id);
  }

  function handleNameChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    setNameDraft(event.target.value);
  }

  function handleDraftChange(patch: Partial<SourceDraft>): void {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function handleCloseEdit(): void {
    resetDeleteState();
    onCloseEdit();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    sourcesStore.updateSource(source.id, {
      name: nameDraft,
      settings: buildSourceSettings(draft)
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

  const shouldShowResetCreditsPanel = (usageState?.isLoading && resetCredits === undefined)
    || (resetCredits !== undefined && resetCredits !== null && resetCredits.availableCount > 0);

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
        <Box
          sx={{
            alignItems: "flex-start",
            display: "grid",
            flex: "1 1 auto",
            gap: 2,
            gridTemplateColumns: shouldShowResetCreditsPanel
              ? { xs: "minmax(0, 1fr)", md: "minmax(0, 1.15fr) minmax(220px, 0.85fr)" }
              : "minmax(0, 1fr)",
            minWidth: 0
          }}
        >
        <Box sx={{ display: "flex", gap: 1, minWidth: 0 }}>
          <Box
            component="span"
            aria-hidden="true"
            sx={[
              getSourceBadgeSx(source.settings.color),
              {
                borderRadius: 999,
                flex: "0 0 auto",
                height: 12,
                mt: 0.85,
                width: 12
              }
            ]}
          />
          <Stack spacing={0.5} sx={{ minWidth: 0 }}>
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "center", minWidth: 0 }}
            >
              <Typography variant="subtitle1" component="h3" noWrap>
                {source.name}
              </Typography>
              {isDefault ? (
                <Chip
                  size="small"
                  color="primary"
                  icon={<CheckCircleOutlinedIcon />}
                  label={t("sources.default")}
                />
              ) : null}
            </Stack>
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "center", minWidth: 0 }}
            >
              <Chip
                size="small"
                variant="outlined"
                label={t(getSourceKindLabelKey(source.kind))}
                sx={{ flex: "0 0 auto", height: 22 }}
              />
              <Typography variant="body2" color="text.secondary" noWrap>
                {source.resolvedCommand}
              </Typography>
            </Stack>
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
          </Stack>
        </Box>
        {shouldShowResetCreditsPanel ? (
          <Box sx={{ minWidth: 0 }}>
            {usageState?.isLoading && resetCredits === undefined ? (
              <Typography variant="caption" color="text.secondary">
                {t("sources.resetCredits.loading")}
              </Typography>
            ) : null}
            {resetCredits !== undefined && resetCredits !== null && resetCredits.availableCount > 0 ? (
              <Paper
                component="section"
                variant="outlined"
                aria-label={t("sources.resetCredits.available", {
                  count: resetCredits.availableCount
                })}
                sx={{
                  borderColor: "divider",
                  borderLeft: "2px solid",
                  borderLeftColor: "primary.main",
                  backgroundColor: "transparent"
                }}
              >
                <Stack spacing={1.25} sx={{ p: 1.25 }}>
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                    <AutorenewOutlinedIcon sx={{ color: "primary.main", fontSize: 19 }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      {t("sources.resetCredits.panelTitle")}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: "baseline" }}>
                    <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1 }}>
                      {resetCredits.availableCount}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t("sources.resetCredits.availableLabel", {
                        count: resetCredits.availableCount
                      })}
                    </Typography>
                  </Stack>
                  <Button
                    type="button"
                    size="small"
                    variant="outlined"
                    fullWidth
                    endIcon={<ArrowForwardRoundedIcon fontSize="small" />}
                    onClick={handleOpenResetCredits}
                  >
                    {t("sources.resetCredits.viewDetails")}
                  </Button>
                </Stack>
              </Paper>
            ) : null}
          </Box>
        ) : null}
        </Box>
        {!isDefault ? (
          <Tooltip title={t("sources.setDefault")}>
            <Button
              size="small"
              startIcon={<StarBorderOutlinedIcon />}
              onClick={handleSetDefaultSource}
              sx={{ flex: "0 0 auto" }}
            >
              {t("sources.setDefault")}
            </Button>
          </Tooltip>
        ) : null}
        <Stack
          direction={{ xs: "row", sm: "column" }}
          spacing={0.25}
          sx={{
            alignItems: "center",
            flex: "0 0 auto"
          }}
        >
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
        </Stack>
      </Box>

      <EditSourceDialog
        open={isEditing}
        name={nameDraft}
        draft={draft}
        store={store}
        commandCandidates={source.commandCandidates}
        selectedCommand={source.resolvedCommand}
        isDefault={isDefault}
        isDeleting={isDeleting}
        onNameChange={handleNameChange}
        onDraftChange={handleDraftChange}
        onClose={handleCloseEdit}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
      />

      <DeleteSourceDialog
        open={isDeleteConfirmationOpen}
        associatedProjectCount={source.associatedProjectCount}
        isConfirmed={isDeleteConfirmed}
        isDeleting={isDeleting}
        onConfirmationToggle={handleDeleteConfirmationToggle}
        onCancel={handleCancelDelete}
        onConfirm={handleConfirmDelete}
      />

      {resetCredits !== undefined && resetCredits !== null ? (
        <UsageResetCreditsDialogX
          open={isResetCreditsDialogOpen}
          sourceName={source.name}
          summary={resetCredits}
          isRefreshing={usageState?.isLoading ?? false}
          isConsuming={usageState?.isConsumingReset ?? false}
          error={usageState?.error ?? null}
          onClose={handleCloseResetCredits}
          onRefresh={handleRefreshResetCredits}
          onConsume={(creditId) => store.usageStore.consumeReset(source.id, creditId)}
        />
      ) : null}
    </Box>
  );
}

export const HomeSourceBoxX = observer(HomeSourceBox);
