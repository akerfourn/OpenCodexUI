/**
 * Renders the Git commit controls for one opened project.
 */
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import { Button, IconButton, LinearProgress, Stack, TextField, Tooltip } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { ProjectGitStore } from "../../stores/ProjectGitStore";

type ProjectGitCommitSectionProps = {
  generateTooltip: string;
  gitLabelsKey: "git.simple" | "git.technical";
  gitStore: ProjectGitStore;
  onOpenGenerateDialog(): void;
};

/**
 * Renders the commit message input and commit actions.
 *
 * @param props Component props.
 *
 * @returns Rendered Git commit section.
 */
export function ProjectGitCommitSection({
  generateTooltip,
  gitLabelsKey,
  gitStore,
  onOpenGenerateDialog
}: ProjectGitCommitSectionProps) {
  const { t } = useTranslation();

  return (
    <Stack spacing={1}>
      {gitStore.isGeneratingCommitMessage ? <LinearProgress /> : null}
      <TextField
        label={t(`${gitLabelsKey}.commitMessage`)}
        value={gitStore.commitMessage}
        minRows={3}
        multiline
        fullWidth
        disabled={gitStore.isCommitting || gitStore.isGeneratingCommitMessage}
        onChange={(event) => gitStore.setCommitMessage(event.target.value)}
      />
      <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
        <Tooltip title={generateTooltip}>
          <span>
            <IconButton
              aria-label={t(`${gitLabelsKey}.generateMessage`)}
              size="small"
              disabled={!gitStore.canGenerateCommitMessage}
              onClick={onOpenGenerateDialog}
            >
              <AutoAwesomeOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Button
          variant="contained"
          disabled={!gitStore.canCommit}
          onClick={() => void gitStore.commit()}
        >
          {t(`${gitLabelsKey}.commit`)}
        </Button>
      </Stack>
    </Stack>
  );
}

export const ProjectGitCommitSectionX = observer(ProjectGitCommitSection);
