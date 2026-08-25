/**
 * Renders the project-local Codex command rules panel.
 */
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexProjectCommandRule } from "@open-codex-ui/opencodex-protocol";

import type { ProjectStore } from "../../stores/project/ProjectStore";
import { ProjectRuleCardX } from "./ProjectRuleCard";
import { ProjectRuleDialogX } from "./ProjectRuleDialog";

type ProjectRulesPanelProps = {
  projectStore: ProjectStore;
};

/**
 * Renders managed project rules, file synchronization controls, and policy tests.
 *
 * @param props Component props.
 * @returns Rendered rules panel.
 */
export function ProjectRulesPanel({ projectStore }: ProjectRulesPanelProps) {
  const { t } = useTranslation();
  const rulesStore = projectStore.rulesStore;
  const [editedRule, setEditedRule] = useState<OpenCodexProjectCommandRule | null>(null);
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [isOverwriteDialogOpen, setOverwriteDialogOpen] = useState(false);
  const [isOverwriteConfirmed, setOverwriteConfirmed] = useState(false);
  const [testCommand, setTestCommand] = useState("");

  useEffect(() => {
    void rulesStore.loadRules();
  }, [projectStore.project.id, rulesStore]);

  function handleCreate(): void {
    setEditedRule(null);
    setDialogOpen(true);
  }

  function handleEdit(rule: OpenCodexProjectCommandRule): void {
    setEditedRule(rule);
    setDialogOpen(true);
  }

  function handleCloseDialog(): void {
    setDialogOpen(false);
  }

  async function handleApply(): Promise<void> {
    const result = await rulesStore.applyRules(false);

    if (result?.requiresConfirmation) {
      setOverwriteConfirmed(false);
      setOverwriteDialogOpen(true);
    }
  }

  async function handleConfirmOverwrite(): Promise<void> {
    if (!isOverwriteConfirmed) {
      return;
    }

    await rulesStore.applyRules(true);
    setOverwriteDialogOpen(false);
  }

  function handleTest(): void {
    void rulesStore.testRule(testCommand);
  }

  function handleRestart(): void {
    void rulesStore.restartRules().catch(() => undefined);
  }

  const status = rulesStore.status;
  const isSourceUnavailable = projectStore.project.sourceId === null || !projectStore.isCodexSourceReady;
  const isUnsupported = status?.fileStatus === "unsupported";
  const canManageRules = rulesStore.isAvailable && !isUnsupported;
  const canApply = canManageRules && status !== null && status.fileStatus !== "synchronized" && !rulesStore.isApplying;
  const canTest = canManageRules && status?.fileStatus === "synchronized" && !rulesStore.isTesting;
  const canRestart = status?.runtimeState === "restartPending" || status?.runtimeState === "error";

  return (
    <section className="project-rules-panel">
      <Stack className="project-rules-header" direction="row" spacing={1}>
        <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
          <Typography variant="caption" color="text.secondary">
            {t("rules.description")}
          </Typography>
        </Box>
        <Tooltip title={t("rules.add")}>
          <span>
            <IconButton
              className="project-rule-add-button"
              size="small"
              aria-label={t("rules.add")}
              disabled={!canManageRules || rulesStore.isSaving}
              onClick={handleCreate}
            >
              <AddOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t("rules.apply")}>
          <span>
            <IconButton
              className="project-rule-apply-button"
              size="small"
              aria-label={t("rules.apply")}
              disabled={!canApply}
              onClick={() => {
                void handleApply().catch(() => undefined);
              }}
            >
              <SaveOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t("header.refresh")}>
          <span>
            <IconButton
              size="small"
              aria-label={t("header.refresh")}
              disabled={rulesStore.isLoading}
              onClick={() => {
                void rulesStore.loadRules();
              }}
            >
              <RefreshOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      <Stack className="project-rules-content" spacing={1}>
        {rulesStore.errorMessage !== null ? (
          <Alert severity="error">{rulesStore.errorMessage}</Alert>
        ) : null}

        {isSourceUnavailable ? (
          <Alert severity="warning">{t("rules.sourceUnavailable")}</Alert>
        ) : null}

        {isUnsupported ? (
          <Alert severity="info">{t("rules.unsupportedSource")}</Alert>
        ) : null}

        {status?.fileStatus === "external" ? (
          <Alert severity="warning">
            {t("rules.fileExternal")}
          </Alert>
        ) : null}

        {status?.fileStatus === "pending" ? (
          <Alert severity="info">{t("rules.filePending")}</Alert>
        ) : null}

        {status?.fileStatus === "notGenerated" ? (
          <Alert severity="info">{t("rules.fileNotGenerated")}</Alert>
        ) : null}

        {status?.filePath !== null && status?.filePath !== undefined ? (
          <Typography className="project-rules-file-path" variant="caption" color="text.secondary" title={status.filePath}>
            {t("rules.filePath", { path: status.filePath })}
          </Typography>
        ) : null}

        {status?.runtimeState === "restartPending" ? (
          <Alert
            severity="warning"
            action={(
              <Button color="inherit" size="small" disabled={rulesStore.isRestarting} onClick={handleRestart}>
                {t("rules.restart")}
              </Button>
            )}
          >
            {t("rules.restartPending")}
          </Alert>
        ) : null}

        {status?.runtimeState === "restarting" ? (
          <Alert severity="info" icon={<CircularProgress size={18} />}>
            {t("rules.restarting")}
          </Alert>
        ) : null}

        {canRestart && status?.runtimeMessage !== null ? (
          <Alert
            severity="error"
            action={(
              <Button color="inherit" size="small" disabled={rulesStore.isRestarting} onClick={handleRestart}>
                {t("rules.restart")}
              </Button>
            )}
          >
            {t("rules.restartError", { message: status.runtimeMessage })}
          </Alert>
        ) : null}

        {rulesStore.isLoading ? <CircularProgress size={18} /> : null}

        {rulesStore.rules.length === 0 && !rulesStore.isLoading ? (
          <Typography variant="body2" color="text.secondary">
            {t("rules.empty")}
          </Typography>
        ) : null}

        {rulesStore.rules.map((rule) => (
          <ProjectRuleCardX
            key={rule.id}
            rule={rule}
            rulesStore={rulesStore}
            disabled={!canManageRules}
            onEdit={handleEdit}
          />
        ))}

        <Box className="project-rules-test">
          <Typography variant="subtitle2">{t("rules.commandTest")}</Typography>
          <Typography variant="caption" color="text.secondary">
            {t("rules.commandTestDescription")}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <TextField
              size="small"
              fullWidth
              value={testCommand}
              placeholder={t("rules.commandTestPlaceholder")}
              onChange={(event) => setTestCommand(event.target.value)}
            />
            <Button
              variant="outlined"
              disabled={!canTest || testCommand.trim().length === 0}
              onClick={handleTest}
            >
              {t("rules.test")}
            </Button>
          </Stack>
          {rulesStore.testResult !== null ? (
            <RuleTestResult result={rulesStore.testResult} />
          ) : null}
        </Box>
      </Stack>

      <ProjectRuleDialogX
        rule={editedRule}
        rulesStore={rulesStore}
        open={isDialogOpen}
        onClose={handleCloseDialog}
      />

      <Dialog
        open={isOverwriteDialogOpen}
        fullWidth
        maxWidth="xs"
        onClose={() => {
          if (!rulesStore.isApplying) {
            setOverwriteDialogOpen(false);
          }
        }}
      >
        <DialogTitle>{t("rules.overwriteTitle")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t("rules.overwriteDescription")}</Typography>
          <FormControlLabel
            control={(
              <Checkbox
                checked={isOverwriteConfirmed}
                onChange={(event) => setOverwriteConfirmed(event.target.checked)}
              />
            )}
            label={t("rules.overwriteConfirmCheckbox")}
          />
        </DialogContent>
        <DialogActions>
          <Button disabled={rulesStore.isApplying} onClick={() => setOverwriteDialogOpen(false)}>
            {t("rules.cancel")}
          </Button>
          <Button
            color="warning"
            disabled={!isOverwriteConfirmed || rulesStore.isApplying}
            onClick={() => {
              void handleConfirmOverwrite().catch(() => undefined);
            }}
          >
            {t("rules.apply")}
          </Button>
        </DialogActions>
      </Dialog>
    </section>
  );
}

export const ProjectRulesPanelX = observer(ProjectRulesPanel);

type RuleTestResultProps = {
  result: NonNullable<import("@open-codex-ui/opencodex-protocol").OpenCodexProjectCommandRuleTestResult>;
};

/**
 * Renders the structured output of one policy test.
 *
 * @param props Component props.
 * @returns Rendered policy test result.
 */
function RuleTestResult({ result }: RuleTestResultProps) {
  const { t } = useTranslation();
  const severity = result.parseError !== null || result.exitCode !== 0
    ? "error"
    : result.decision === "allow"
      ? "success"
      : result.decision === "forbidden"
        ? "error"
        : "info";

  const decisionLabel = result.decision === null
    ? t("rules.noMatch")
    : t(`rules.decisions.${result.decision}`);

  return (
    <Alert className="project-rules-test-result" severity={severity}>
      <Typography variant="body2">{t("rules.testResult")} : {decisionLabel}</Typography>
      <Typography variant="caption" sx={{ display: "block" }}>
        {t("rules.testExitCode", { code: result.exitCode })}
      </Typography>
      {result.parseError !== null ? (
        <Typography variant="caption" sx={{ display: "block" }}>
          {t("rules.testParseError", { message: result.parseError })}
        </Typography>
      ) : null}
      {result.matchedRules.map((match, index) => (
        <Typography key={`${match.matchedPrefix.join(" ")}-${index}`} variant="caption" sx={{ display: "block" }}>
          {t("rules.testMatchedPrefix", { prefix: match.matchedPrefix.join(" ") })}
        </Typography>
      ))}
    </Alert>
  );
}
