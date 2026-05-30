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

type ProjectBranchGroupProps = {
  title: string;
  branches: OpenCodexGitBranch[];
  isBusy: boolean;
  onSelect(branch: OpenCodexGitBranch): Promise<void>;
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
  isBusy,
  onSelect
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
              disabled={isBusy || branch.isCurrent}
              onClick={() => {
                void onSelect(branch);
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
