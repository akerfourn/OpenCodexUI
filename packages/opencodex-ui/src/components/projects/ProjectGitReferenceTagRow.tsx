/**
 * Renders the selected Git reference tag summary.
 */
import LocalOfferOutlinedIcon from "@mui/icons-material/LocalOfferOutlined";
import { Box, CircularProgress, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { ProjectGitStore } from "../../stores/ProjectGitStore";

type ProjectGitReferenceTagRowProps = {
  gitStore: ProjectGitStore;
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
  gitStore,
  dense = false,
  onOpenSelector
}: ProjectGitReferenceTagRowProps) {
  const { t } = useTranslation();
  const tagLabel = readTagLabel(gitStore, t("git.noReferenceTag"));
  const tagDetails = gitStore.commitsSinceReferenceTag !== null
    ? t("git.commitsSinceTag", { count: gitStore.commitsSinceReferenceTag })
    : null;

  if (dense) {
    return (
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
        <LocalOfferOutlinedIcon color="action" sx={{ fontSize: 14 }} />
        <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
          {tagDetails === null ? tagLabel : `${tagLabel} · ${tagDetails}`}
        </Typography>
        {gitStore.isLoadingTagReference ? <CircularProgress size={12} /> : null}
        <Tooltip title={t("git.tagSelector")}>
          <span className="git-panel-header-action">
            <IconButton
              aria-label={t("git.tagSelector")}
              size="small"
              disabled={!gitStore.isAvailable || !gitStore.status.isRepository}
              onClick={onOpenSelector}
              sx={{ height: 22, width: 22 }}
            >
              <LocalOfferOutlinedIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
    );
  }

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
      <LocalOfferOutlinedIcon color="action" sx={{ fontSize: 16 }} />
      <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
        <Typography variant="caption" color="text.secondary" noWrap>
          {tagLabel}
        </Typography>
        {tagDetails !== null ? (
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            sx={{ display: "block" }}
          >
            {tagDetails}
          </Typography>
        ) : null}
      </Box>
      {gitStore.isLoadingTagReference ? <CircularProgress size={14} /> : null}
      <Tooltip title={t("git.tagSelector")}>
        <span>
          <IconButton
            aria-label={t("git.tagSelector")}
            size="small"
            disabled={!gitStore.isAvailable || !gitStore.status.isRepository}
            onClick={onOpenSelector}
            sx={{ height: 26, width: 26 }}
          >
            <LocalOfferOutlinedIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </span>
      </Tooltip>
    </Stack>
  );
}

export const ProjectGitReferenceTagRowX = observer(ProjectGitReferenceTagRow);

function readTagLabel(gitStore: ProjectGitStore, fallback: string): string {
  return gitStore.selectedReferenceTagName ?? fallback;
}
