/**
 * Renders one managed project command authorization rule.
 */
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Stack,
  Tooltip,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexProjectCommandRule } from "@open-codex-ui/opencodex-protocol";

import type { ProjectRulesStore } from "../../stores/ProjectRulesStore";

type ProjectRuleCardProps = {
  rule: OpenCodexProjectCommandRule;
  rulesStore: ProjectRulesStore;
  disabled?: boolean;
  onEdit(rule: OpenCodexProjectCommandRule): void;
};

/**
 * Renders one rule card and its delete confirmation dialog.
 *
 * @param props Component props.
 * @returns Rendered rule card.
 */
export function ProjectRuleCard({ rule, rulesStore, disabled = false, onEdit }: ProjectRuleCardProps) {
  const { t } = useTranslation();
  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleteConfirmed, setDeleteConfirmed] = useState(false);

  function handleToggle(): void {
    if (disabled) {
      return;
    }

    void rulesStore.updateRule(rule.id, {
      name: rule.name,
      pattern: rule.pattern.join("\n"),
      decision: rule.decision,
      justification: rule.justification ?? "",
      matchExamples: rule.matchExamples.join("\n"),
      notMatchExamples: rule.notMatchExamples.join("\n"),
      enabled: !rule.enabled
    }).catch(() => undefined);
  }

  function handleOpenDelete(): void {
    setDeleteConfirmed(false);
    setDeleteDialogOpen(true);
  }

  function handleCloseDelete(): void {
    if (!rulesStore.isSaving) {
      setDeleteDialogOpen(false);
    }
  }

  async function handleConfirmDelete(): Promise<void> {
    if (!isDeleteConfirmed) {
      return;
    }

    await rulesStore.deleteRule(rule.id);
    setDeleteDialogOpen(false);
  }

  return (
    <>
      <Box className={`project-rule-card${rule.enabled ? "" : " is-disabled"}`}>
        <Stack className="project-rule-card-header" direction="row" spacing={1}>
          <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
            <Stack direction="row" spacing={0.75} sx={{ minWidth: 0, alignItems: "center" }}>
              <Typography variant="body2" noWrap>{rule.name}</Typography>
              <Chip
                size="small"
                color={getDecisionColor(rule.decision)}
                label={t(`rules.decisions.${rule.decision}`)}
              />
            </Stack>
            <Typography className="project-rule-pattern" variant="caption" color="text.secondary">
              {rule.pattern.join(" ")}
            </Typography>
          </Box>
          <FormControlLabel
            className="project-rule-enabled-toggle"
            control={<Checkbox size="small" checked={rule.enabled} disabled={disabled} onChange={handleToggle} />}
            label={rule.enabled ? t("rules.enabled") : t("rules.disabled")}
          />
          <Tooltip title={t("rules.edit")}>
            <IconButton size="small" disabled={disabled} aria-label={t("rules.edit")} onClick={() => onEdit(rule)}>
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={t("rules.delete")}>
            <IconButton size="small" color="error" disabled={disabled} aria-label={t("rules.delete")} onClick={handleOpenDelete}>
              <DeleteOutlineOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
        {rule.justification !== null ? (
          <Typography className="project-rule-justification" variant="caption" color="text.secondary">
            {rule.justification}
          </Typography>
        ) : null}
      </Box>

      <Dialog open={isDeleteDialogOpen} fullWidth maxWidth="xs" onClose={handleCloseDelete}>
        <DialogTitle>{t("rules.deleteTitle")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {t("rules.deleteDescription", { name: rule.name })}
          </Typography>
          <FormControlLabel
            control={(
              <Checkbox
                checked={isDeleteConfirmed}
                onChange={(event) => setDeleteConfirmed(event.target.checked)}
              />
            )}
            label={t("rules.deleteConfirmCheckbox")}
          />
        </DialogContent>
        <DialogActions>
          <Button disabled={rulesStore.isSaving} onClick={handleCloseDelete}>
            {t("rules.cancel")}
          </Button>
          <Button
            color="error"
            disabled={!isDeleteConfirmed || rulesStore.isSaving}
            onClick={() => {
              void handleConfirmDelete().catch(() => undefined);
            }}
          >
            {t("rules.delete")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export const ProjectRuleCardX = observer(ProjectRuleCard);

/**
 * Returns the visual color associated with a policy decision.
 *
 * @param decision Rule decision.
 * @returns MUI chip color.
 */
function getDecisionColor(
  decision: OpenCodexProjectCommandRule["decision"]
): "success" | "warning" | "error" {
  if (decision === "allow") {
    return "success";
  }

  if (decision === "forbidden") {
    return "error";
  }

  return "warning";
}
