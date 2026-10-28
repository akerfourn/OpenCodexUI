/**
 * Renders the selected Git reference tag summary.
 */
import LocalOfferOutlinedIcon from "@mui/icons-material/LocalOfferOutlined";
import { Box, CircularProgress, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { ProjectGitTagStore } from "../../stores/project/git/ProjectGitTagStore";

type ProjectGitReferenceTagRowProps = {
  tagStore: ProjectGitTagStore;
  dense?: boolean;
  onOpenSelector(): void;
};

/**
 * Renders the reference tag row shown in the Git panel.
 *
 * @param props Component props.
 *
 * @returns Rendered tag row.
 */
export function ProjectGitReferenceTagRow({
  tagStore,
  dense = false,
  onOpenSelector
}: ProjectGitReferenceTagRowProps) {
  const { t } = useTranslation();
  const tagLabel = readTagLabel(tagStore, t("git.noReferenceTag"));
  const tagDetails = tagStore.commitsSinceReferenceTag !== null
    ? t("git.commitsSinceTag", { count: tagStore.commitsSinceReferenceTag })
    : null;

  const summary = tagDetails === null ? tagLabel : `${tagLabel} · ${tagDetails}`;
  const iconSize = dense ? 14 : 16;
  const buttonSize = dense ? 22 : 26;
  const selector = (
    <Tooltip title={t("git.tagSelector")} placement="left" disableInteractive>
      <span style={{ flexShrink: 0 }}>
        <IconButton aria-label={t("git.tagSelector")} size="small"
          disabled={!tagStore.isAvailable || !tagStore.isRepository}
          onClick={onOpenSelector} sx={{ height: buttonSize, width: buttonSize }}>
          <LocalOfferOutlinedIcon sx={{ fontSize: iconSize }} />
        </IconButton>
      </span>
    </Tooltip>
  );
  const loading = tagStore.isLoadingTagReference
    ? <CircularProgress size={dense ? 12 : 14} sx={{ flexShrink: 0 }} /> : null;

  if (dense) {
    return (
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0, width: "100%" }}>
        {selector}
        <Typography variant="caption" color="text.secondary" noWrap title={summary}
          sx={{ minWidth: 0, flex: "1 1 auto" }}>{summary}</Typography>
        {loading}
      </Stack>
    );
  }

  let detailsContent = null;
  if (tagDetails !== null) {
    detailsContent = <Typography variant="caption" color="text.secondary" noWrap title={tagDetails}
      sx={{ display: "block" }}>{tagDetails}</Typography>;
  }
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
      {selector}
      <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
        <Typography variant="caption" color="text.secondary" noWrap title={tagLabel}
          sx={{ display: "block" }}>{tagLabel}</Typography>
        {detailsContent}
      </Box>
      {loading}
    </Stack>
  );
}

export const ProjectGitReferenceTagRowX = observer(ProjectGitReferenceTagRow);

/** Uses the selected reference or the localized empty state. */
function readTagLabel(tagStore: ProjectGitTagStore, fallback: string): string {
  return tagStore.selectedReferenceTagName ?? fallback;
}
