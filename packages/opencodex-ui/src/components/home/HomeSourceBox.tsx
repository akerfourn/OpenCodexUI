/**
 * Renders one Codex source card and its edit dialog.
 */
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import AutorenewOutlinedIcon from "@mui/icons-material/AutorenewOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import UpdateOutlinedIcon from "@mui/icons-material/UpdateOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
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
import { EditSourceDialogX } from "./EditSourceDialog";
import { HomeSourceActionsX } from "./HomeSourceActions";
import { HomeSourceInstanceX } from "./HomeSourceInstance";
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
  const [codexUpdateError, setCodexUpdateError] = useState<string | null>(null);
  const [isResetCreditsDialogOpen, setIsResetCreditsDialogOpen] = useState(false);
  const sourcesStore = store.sourcesStore;
  const usageState = store.usageStore.getSourceUsage(source.id);
  const resetCredits = usageState?.rateLimitResetCredits;
  const isSyncing = sourcesStore.isSourceSyncing(source.id);
  const instance = store.sourceInstancesStore.states.get(source.id);
  const isInstanceBusy = instance?.isActive === true || instance?.phase === "starting"
    || instance?.phase === "stopping" || instance?.phase === "updating";

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
    if (!source.codexUpdate.updateAvailable || isUpdatingCodex || isInstanceBusy) {
      return;
    }

    setIsUpdatingCodex(true);
    setCodexUpdateError(null);
    void sourcesStore.updateCodexSource(source.id).catch(handleCodexUpdateError).finally(() => {
      setIsUpdatingCodex(false);
    });
  }

  /** Keeps native updater failures visible on the source without leaving an unhandled promise rejection. */
  function handleCodexUpdateError(error: unknown): void {
    setCodexUpdateError(error instanceof Error ? error.message : String(error));
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

  /** Opens official guidance without inheriting another project's source context. */
  function handleOpenResetHelp(href: string): void {
    store.openLink(href, null, null, source.id);
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
  let codexUpdateErrorContent = null;
  if (codexUpdateError !== null) codexUpdateErrorContent = (
    <Typography variant="caption" role="alert" color="error.main" sx={{ overflowWrap: "anywhere" }}>
      {t("sources.codexUpdateError", { error: codexUpdateError })}
    </Typography>
  );

  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        p: 2
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
            <HomeSourceInstanceX sourceId={source.id} sourceName={source.name} instances={store.sourceInstancesStore} />
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
                    disabled={isUpdatingCodex || isSyncing || isInstanceBusy}
                    startIcon={<UpdateOutlinedIcon fontSize="small" />}
                    onClick={handleUpdateCodex}
                    sx={{ minWidth: 0, py: 0 }}
                  >
                    {t("sources.updateCodex")}
                  </Button>
                ) : null}
              </Box>
            ) : null}
            {codexUpdateErrorContent}
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
        <HomeSourceActionsX isDefault={isDefault} isSyncing={isSyncing}
          onDefault={handleSetDefaultSource} onSync={handleSyncSource} onConfigure={handleEdit} />
      </Box>

      {isEditing ? <EditSourceDialogX
        open={isEditing}
        sourceId={source.id}
        sourceName={source.name}
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
      /> : null}

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
          usage={usageState?.usagesByLimitId.get("codex") ?? null}
          isRefreshing={usageState?.isLoading ?? false}
          isConsuming={usageState?.isConsumingReset ?? false}
          error={usageState?.error ?? null}
          onClose={handleCloseResetCredits}
          onRefresh={handleRefreshResetCredits}
          onOpenHelp={handleOpenResetHelp}
          onConsume={(creditId) => store.usageStore.consumeReset(source.id, creditId)}
        />
      ) : null}
    </Box>
  );
}

export const HomeSourceBoxX = observer(HomeSourceBox);
