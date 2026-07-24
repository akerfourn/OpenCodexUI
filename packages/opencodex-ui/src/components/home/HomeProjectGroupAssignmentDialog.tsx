import FolderCopyOutlinedIcon from "@mui/icons-material/FolderCopyOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Radio
} from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexProject,
  OpenCodexProjectGroup
} from "@open-codex-ui/opencodex-protocol";

import { getSourceColorOption } from "./sourceColor";

type HomeProjectGroupAssignmentDialogProps = {
  project: OpenCodexProject | null;
  groups: OpenCodexProjectGroup[];
  currentGroupId: string | null;
  onCancel(): void;
  onConfirm(groupId: string | null): void;
};

/** Renders the project-to-group assignment dialog. */
export function HomeProjectGroupAssignmentDialog({
  project,
  groups,
  currentGroupId,
  onCancel,
  onConfirm
}: HomeProjectGroupAssignmentDialogProps) {
  const { t } = useTranslation();
  const [selectedGroupId, setSelectedGroupId] = useState(currentGroupId ?? "");

  useEffect(() => {
    if (project !== null) {
      setSelectedGroupId(currentGroupId ?? "");
    }
  }, [currentGroupId, project]);

  function handleConfirm(): void {
    onConfirm(selectedGroupId.length === 0 ? null : selectedGroupId);
  }

  const projectName = project?.displayName ?? project?.defaultName ?? "";

  return (
    <Dialog open={project !== null} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{t("home.organizeProject", { project: projectName })}</DialogTitle>
      <DialogContent>
        <List
          aria-label={t("home.projectGroup")}
          sx={{ border: 1, borderColor: "divider", borderRadius: 1, mt: 1, py: 0 }}
        >
          <ListItemButton
            selected={selectedGroupId.length === 0}
            onClick={() => setSelectedGroupId("")}
          >
            <ListItemIcon sx={{ minWidth: 38 }}>
              <Radio checked={selectedGroupId.length === 0} tabIndex={-1} />
            </ListItemIcon>
            <ListItemIcon sx={{ minWidth: 34 }}>
              <FolderOutlinedIcon fontSize="small" color="action" />
            </ListItemIcon>
            <ListItemText primary={t("home.ungroupedProjects")} />
          </ListItemButton>
          {groups.map((group) => {
            const colorOption = getSourceColorOption(group.color);
            const isSelected = selectedGroupId === group.id;

            return (
              <ListItemButton
                key={group.id}
                selected={isSelected}
                onClick={() => setSelectedGroupId(group.id)}
              >
                <ListItemIcon sx={{ minWidth: 38 }}>
                  <Radio checked={isSelected} tabIndex={-1} />
                </ListItemIcon>
                <ListItemIcon sx={{ minWidth: 34 }}>
                  <FolderCopyOutlinedIcon fontSize="small" sx={{ color: colorOption.main }} />
                </ListItemIcon>
                <ListItemText primary={group.name} />
              </ListItemButton>
            );
          })}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{t("home.deleteProjectCancel")}</Button>
        <Button onClick={handleConfirm} variant="contained">{t("home.moveProject")}</Button>
      </DialogActions>
    </Dialog>
  );
}
