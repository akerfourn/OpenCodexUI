/**
 * Renders the mixed project tree with visual containers around expanded groups.
 */
import { alpha } from "@mui/material/styles";
import { Box, List } from "@mui/material";
import { Fragment } from "react";

import type {
  OpenCodexProject,
  OpenCodexSource,
  OpenCodexProjectGroup
} from "@open-codex-ui/opencodex-protocol";

import { HomeProjectGroupRow } from "./HomeProjectGroupRow";
import { HomeProjectListItem } from "./HomeProjectListItem";
import {
  getSourceColorOption
} from "./sourceColor";
import type { HomeProjectTreeBranch } from "./homeProjectTree";

type HomeProjectTreeListProps = {
  branches: HomeProjectTreeBranch[];
  sourceById: Map<string, OpenCodexSource>;
  onOpenProject(projectPath: string, sourceId: string | null): void;
  onSetProjectHidden(projectId: string, isHidden: boolean): void;
  onDeleteProject(project: OpenCodexProject): void;
  onOrganizeProject(project: OpenCodexProject): void;
  onToggleGroup(groupId: string): void;
  onRenameGroup(group: OpenCodexProjectGroup): void;
  onDeleteGroup(group: OpenCodexProjectGroup): void;
};

/** Renders the root list of projects and nested groups. */
export function HomeProjectTreeList({
  branches,
  sourceById,
  onOpenProject,
  onSetProjectHidden,
  onDeleteProject,
  onOrganizeProject,
  onToggleGroup,
  onRenameGroup,
  onDeleteGroup
}: HomeProjectTreeListProps) {
  return (
    <List dense sx={{ mt: 1 }}>
      {branches.map((branch) => (
        <HomeProjectTreeBranchView
          key={getBranchKey(branch)}
          branch={branch}
          sourceById={sourceById}
          onOpenProject={onOpenProject}
          onSetProjectHidden={onSetProjectHidden}
          onDeleteProject={onDeleteProject}
          onOrganizeProject={onOrganizeProject}
          onToggleGroup={onToggleGroup}
          onRenameGroup={onRenameGroup}
          onDeleteGroup={onDeleteGroup}
        />
      ))}
    </List>
  );
}

type HomeProjectTreeBranchViewProps = Omit<HomeProjectTreeListProps, "branches"> & {
  branch: HomeProjectTreeBranch;
};

/** Renders one tree branch and surrounds expanded groups with a border. */
function HomeProjectTreeBranchView({
  branch,
  sourceById,
  onOpenProject,
  onSetProjectHidden,
  onDeleteProject,
  onOrganizeProject,
  onToggleGroup,
  onRenameGroup,
  onDeleteGroup
}: HomeProjectTreeBranchViewProps) {
  if (branch.node.type === "project") {
    const source = branch.node.project.sourceId === null
      ? null
      : sourceById.get(branch.node.project.sourceId) ?? null;

    return (
      <HomeProjectListItem
        project={branch.node.project}
        depth={branch.node.depth}
        sourceName={source === null ? null : source.name}
        sourceColor={source === null ? null : source.settings.color}
        onOpen={onOpenProject}
        onSetHidden={onSetProjectHidden}
        onDelete={onDeleteProject}
        onOrganize={onOrganizeProject}
      />
    );
  }

  const group = branch.node.group;
  const groupContent = (
    <>
      <HomeProjectGroupRow
        group={group}
        editedAt={branch.node.editedAt}
        depth={branch.node.depth}
        childCount={branch.node.childCount}
        onToggle={() => onToggleGroup(group.id)}
        onRename={() => onRenameGroup(group)}
        onDelete={() => onDeleteGroup(group)}
      />
      {branch.children.map((child) => (
        <HomeProjectTreeBranchView
          key={getBranchKey(child)}
          branch={child}
          sourceById={sourceById}
          onOpenProject={onOpenProject}
          onSetProjectHidden={onSetProjectHidden}
          onDeleteProject={onDeleteProject}
          onOrganizeProject={onOrganizeProject}
          onToggleGroup={onToggleGroup}
          onRenameGroup={onRenameGroup}
          onDeleteGroup={onDeleteGroup}
        />
      ))}
    </>
  );

  if (branch.children.length === 0) {
    return <Fragment>{groupContent}</Fragment>;
  }

  const colorOption = getSourceColorOption(group.color);
  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: alpha(colorOption.main, 0.28),
        borderRadius: 1,
        mb: 0.75,
        p: 0.5
      }}
    >
      {groupContent}
    </Box>
  );
}

/** Returns a stable React key for one project tree branch. */
function getBranchKey(branch: HomeProjectTreeBranch): string {
  return branch.node.type === "group"
    ? `group:${branch.node.group.id}`
    : `project:${branch.node.project.id}`;
}
