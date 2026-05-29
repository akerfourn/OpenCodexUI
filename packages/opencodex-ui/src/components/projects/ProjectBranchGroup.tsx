/**
 * Renders one Git branch group in the switcher dialog.
 */
import {
  Box,
  List,
  ListItemButton,
  ListItemText,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { OpenCodexGitBranch } from "@open-codex-ui/opencodex-protocol";

import type { ProjectGitStore } from "../../stores/ProjectGitStore";

type ProjectBranchGroupProps = {
  title: string;
  branches: OpenCodexGitBranch[];
  gitStore: ProjectGitStore;
  onCheckout(branch: OpenCodexGitBranch): Promise<void>;
};

/**
 * Renders a local or remote branch list.
 *
 * @param props Component props.
 *
 * @returns Rendered branch group.
 */
export function ProjectBranchGroup({
  title,
  branches,
  gitStore,
  onCheckout
}: ProjectBranchGroupProps) {
  const { t } = useTranslation();

  return (
    <Box>
      <Typography variant="overline" color="text.secondary">
        {title}
      </Typography>
      {branches.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t("git.noBranches")}
        </Typography>
      ) : (
        <List dense disablePadding>
          {branches.map((branch) => (
            <ListItemButton
              key={branch.fullName}
              disabled={gitStore.isCheckingOutBranch || branch.isCurrent}
              onClick={() => {
                void onCheckout(branch);
              }}
            >
              <ListItemText
                primary={branch.name}
                secondary={branch.isCurrent ? t("git.currentBranch") : branch.upstreamName}
              />
            </ListItemButton>
          ))}
        </List>
      )}
    </Box>
  );
}

export const ProjectBranchGroupX = observer(ProjectBranchGroup);
