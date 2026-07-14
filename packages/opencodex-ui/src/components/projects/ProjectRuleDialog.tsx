/**
 * Renders the create/edit dialog for one managed project command rule.
 */
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField
} from "@mui/material";
import { observer } from "mobx-react-lite";
import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexCommandRuleDecision, OpenCodexProjectCommandRule } from "@open-codex-ui/opencodex-protocol";

import {
  projectRulePresets,
  type ProjectRuleFormInput,
  type ProjectRulesStore
} from "../../stores/ProjectRulesStore";

type ProjectRuleDialogProps = {
  rule: OpenCodexProjectCommandRule | null;
  rulesStore: ProjectRulesStore;
  open: boolean;
  onClose(): void;
};

const emptyInput: ProjectRuleFormInput = {
  name: "",
  pattern: "",
  decision: "allow",
  justification: "",
  matchExamples: "",
  notMatchExamples: "",
  enabled: true
};

/**
 * Renders a modal form to create or edit one project command rule.
 *
 * @param props Component props.
 * @returns Rendered rule dialog.
 */
export function ProjectRuleDialog({ rule, rulesStore, open, onClose }: ProjectRuleDialogProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState<ProjectRuleFormInput>(emptyInput);
  const [selectedPreset, setSelectedPreset] = useState("");
  const isEditing = rule !== null;
  const canSave = input.name.trim().length > 0 && input.pattern.trim().length > 0;

  useEffect(() => {
    if (!open) {
      return;
    }

    setSelectedPreset("");
    setInput(rule === null ? { ...emptyInput } : {
      name: rule.name,
      pattern: rule.pattern.join("\n"),
      decision: rule.decision,
      justification: rule.justification ?? "",
      matchExamples: rule.matchExamples.join("\n"),
      notMatchExamples: rule.notMatchExamples.join("\n"),
      enabled: rule.enabled
    });
  }, [open, rule]);

  function handleTextChange(field: keyof Pick<ProjectRuleFormInput, "name" | "pattern" | "justification" | "matchExamples" | "notMatchExamples">) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
      setInput({ ...input, [field]: event.target.value });
    };
  }

  function handleDecisionChange(event: ChangeEvent<HTMLInputElement>): void {
    setInput({
      ...input,
      decision: event.target.value as OpenCodexCommandRuleDecision
    });
  }

  function handleEnabledChange(event: ChangeEvent<HTMLInputElement>): void {
    setInput({ ...input, enabled: event.target.checked });
  }

  function handlePresetChange(event: ChangeEvent<HTMLInputElement>): void {
    const presetName = event.target.value;
    setSelectedPreset(presetName);

    const preset = projectRulePresets.find((candidate) => candidate.name === presetName);

    if (preset === undefined) {
      return;
    }

    setInput({
      ...input,
      name: preset.name,
      pattern: preset.pattern,
      decision: preset.decision,
      justification: preset.justification,
      matchExamples: `${preset.name}\n`,
      notMatchExamples: "",
      enabled: true
    });
  }

  async function handleSave(): Promise<void> {
    if (!canSave) {
      return;
    }

    try {
      if (rule === null) {
        await rulesStore.createRule(input);
      } else {
        await rulesStore.updateRule(rule.id, input);
      }
      onClose();
    } catch {
      // The store keeps the dialog open and exposes the error to the app surface.
    }
  }

  return (
    <Dialog open={open} fullWidth maxWidth="sm" onClose={onClose}>
      <DialogTitle>{isEditing ? t("rules.editTitle") : t("rules.createTitle")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {!isEditing ? (
            <TextField
              select
              label={t("rules.preset")}
              value={selectedPreset}
              fullWidth
              onChange={handlePresetChange}
            >
              <MenuItem value="">{t("rules.presetNone")}</MenuItem>
              {projectRulePresets.map((preset) => (
                <MenuItem key={preset.name} value={preset.name}>
                  {preset.name}
                </MenuItem>
              ))}
            </TextField>
          ) : null}
          <TextField
            label={t("rules.name")}
            placeholder={t("rules.namePlaceholder")}
            value={input.name}
            fullWidth
            onChange={handleTextChange("name")}
          />
          <TextField
            label={t("rules.pattern")}
            placeholder={t("rules.patternPlaceholder")}
            value={input.pattern}
            fullWidth
            multiline
            minRows={3}
            helperText={t("rules.patternHelper")}
            onChange={handleTextChange("pattern")}
          />
          <TextField
            select
            label={t("rules.decision")}
            value={input.decision}
            fullWidth
            onChange={handleDecisionChange}
          >
            <MenuItem value="allow">{t("rules.decisions.allow")}</MenuItem>
            <MenuItem value="prompt">{t("rules.decisions.prompt")}</MenuItem>
            <MenuItem value="forbidden">{t("rules.decisions.forbidden")}</MenuItem>
          </TextField>
          <TextField
            label={t("rules.justification")}
            placeholder={t("rules.justificationPlaceholder")}
            value={input.justification}
            fullWidth
            multiline
            minRows={2}
            onChange={handleTextChange("justification")}
          />
          <TextField
            label={t("rules.examplesMatch")}
            placeholder={t("rules.examplesMatchPlaceholder")}
            value={input.matchExamples}
            fullWidth
            multiline
            minRows={2}
            onChange={handleTextChange("matchExamples")}
          />
          <TextField
            label={t("rules.examplesNotMatch")}
            placeholder={t("rules.examplesNotMatchPlaceholder")}
            value={input.notMatchExamples}
            fullWidth
            multiline
            minRows={2}
            onChange={handleTextChange("notMatchExamples")}
          />
          <FormControlLabel
            control={<Checkbox checked={input.enabled} onChange={handleEnabledChange} />}
            label={input.enabled ? t("rules.enabled") : t("rules.disabled")}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={rulesStore.isSaving} onClick={onClose}>
          {t("rules.cancel")}
        </Button>
        <Button
          variant="contained"
          disabled={!canSave || rulesStore.isSaving}
          onClick={() => {
            void handleSave();
          }}
        >
          {t("rules.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export const ProjectRuleDialogX = observer(ProjectRuleDialog);
