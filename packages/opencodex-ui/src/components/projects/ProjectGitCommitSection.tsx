/**
 * Renders the Git commit controls for one opened project.
 */
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import { Button, IconButton, LinearProgress, Stack, TextField, Tooltip } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { ProjectGitCommitStore } from "../../stores/ProjectGitCommitStore";

type ProjectGitCommitSectionProps = {
  generateTooltip: string;
  gitLabelsKey: "git.simple" | "git.technical";
  commitStore: ProjectGitCommitStore;
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
  commitStore,
  onOpenGenerateDialog
}: ProjectGitCommitSectionProps) {
  const { t } = useTranslation();

  return (
    <Stack spacing={1}>
      {commitStore.isGeneratingCommitMessage ? <LinearProgress /> : null}
      <TextField
        label={t(`${gitLabelsKey}.commitMessage`)}
        value={commitStore.commitMessage}
        minRows={3}
        multiline
        fullWidth
        disabled={commitStore.isCommitting || commitStore.isGeneratingCommitMessage}
        onChange={(event) => commitStore.setCommitMessage(event.target.value)}
      />
      <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
        <Tooltip title={generateTooltip}>
          <span>
            <IconButton
              aria-label={t(`${gitLabelsKey}.generateMessage`)}
              size="small"
              disabled={!commitStore.canGenerateCommitMessage}
              onClick={onOpenGenerateDialog}
            >
              <AutoAwesomeOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Button
          variant="contained"
          disabled={!commitStore.canCommit}
          onClick={() => void commitStore.commit()}
        >
          {t(`${gitLabelsKey}.commit`)}
        </Button>
      </Stack>
    </Stack>
  );
}

export const ProjectGitCommitSectionX = observer(ProjectGitCommitSection);
