import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField
} from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexProject,
  OpenCodexProjectGroup
} from "@open-codex-ui/opencodex-protocol";

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
        <TextField
          select
          fullWidth
          label={t("home.projectGroup")}
          value={selectedGroupId}
          onChange={(event) => setSelectedGroupId(event.target.value)}
          sx={{ mt: 1 }}
        >
          <MenuItem value="">{t("home.ungroupedProjects")}</MenuItem>
          {groups.map((group) => (
            <MenuItem key={group.id} value={group.id}>
              {group.name}
            </MenuItem>
          ))}
        </TextField>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{t("home.deleteProjectCancel")}</Button>
        <Button onClick={handleConfirm} variant="contained">{t("home.saveChanges")}</Button>
      </DialogActions>
    </Dialog>
  );
}
