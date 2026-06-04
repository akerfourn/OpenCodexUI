/**
 * Renders the first-run setup checks for Codex and Git.
 */
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import type { ChangeEvent } from "react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexSource } from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../../stores/RootStore";

const CODEX_DOCUMENTATION_URL = "https://developers.openai.com/codex/quickstart?setup=cli";

type OnboardingViewProps = {
  store: RootStore;
};

/**
 * Renders startup onboarding.
 *
 * @param props Component props.
 *
 * @returns React node.
 */
export function OnboardingView({ store }: OnboardingViewProps) {
  const { t } = useTranslation();
  const appStore = store.appStore;
  const sourcesStore = store.sourcesStore;
  const defaultSource = getDefaultSource(sourcesStore.sources, appStore.settings.defaultSourceId);
  const codexStatus = defaultSource?.codex.status ?? "unavailable";
  const isCodexReady = codexStatus === "ready";
  const isCodexOutdated = codexStatus === "outdated";
  const isCodexUsable = isCodexReady || (isCodexOutdated && appStore.settings.allowOutdatedCodex);
  const isGitReady = appStore.gitVersionStatus?.status === "ready";
  const isCheckingCodex = sourcesStore.isRefreshingSources;
  const isCheckingGit = appStore.isLoadingGitVersion;
  const codexVersion = defaultSource?.codex.version ?? t("onboarding.unknownVersion");
  const gitVersion = appStore.gitVersionStatus?.version ?? t("onboarding.unknownVersion");
  const codexStatusText = getCodexStatusText(codexStatus, codexVersion, t);
  const gitStatusText = isGitReady
    ? t("onboarding.gitReady", { version: gitVersion })
    : t("onboarding.gitMissing");
  const codexStatusIcon = getStatusIcon(codexStatus, isCheckingCodex);
  const gitStatusIcon = getStatusIcon(isGitReady ? "ready" : "unavailable", isCheckingGit);
  const codexRefreshVariant = isCodexUsable ? "text" : "contained";
  const gitRefreshVariant = isGitReady ? "text" : "outlined";

  useEffect(() => {
    void appStore.loadGitVersion();
  }, [appStore]);

  function handleOpenCodexDocumentation(): void {
    store.openExternalLink(CODEX_DOCUMENTATION_URL);
  }

  function handleRefreshCodex(): void {
    void sourcesStore.refreshSources();
  }

  function handleRefreshGit(): void {
    void appStore.loadGitVersion();
  }

  function handleAllowOutdatedCodexChange(event: ChangeEvent<HTMLInputElement>): void {
    appStore.setAllowOutdatedCodex(event.target.checked);
  }

  function handleFinish(): void {
    appStore.completeOnboarding();
  }

  return (
    <Box component="section" className="onboarding-shell">
      <Paper className="onboarding-panel" elevation={0}>
        <Stack spacing={3}>
          <Stack spacing={1}>
            <Typography variant="h4" component="h1">
              {t("onboarding.title")}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {t("onboarding.subtitle")}
            </Typography>
          </Stack>

          <Stack spacing={2}>
            <Paper className="onboarding-check" variant="outlined">
              <Stack spacing={2}>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                  {codexStatusIcon}
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h6" component="h2">
                      {t("onboarding.codexTitle")}
                    </Typography>
                    <Typography variant="body2" color={isCodexReady ? "success.main" : "error.main"}>
                      {codexStatusText}
                    </Typography>
                  </Box>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {t("onboarding.codexDescription")}
                </Typography>
                {isCodexOutdated ? (
                  <Alert severity="warning" variant="outlined">
                    <Stack spacing={1}>
                      <Typography variant="body2">
                        {t("onboarding.codexOutdated", { version: codexVersion })}
                      </Typography>
                      <FormControlLabel
                        sx={{ m: 0 }}
                        control={(
                          <Switch
                            checked={appStore.settings.allowOutdatedCodex}
                            onChange={handleAllowOutdatedCodexChange}
                          />
                        )}
                        label={t("onboarding.forceOutdatedCodex")}
                      />
                    </Stack>
                  </Alert>
                ) : null}
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                  <Button
                    variant={codexRefreshVariant}
                    startIcon={<RefreshIcon />}
                    onClick={handleRefreshCodex}
                    disabled={isCheckingCodex}
                  >
                    {t("onboarding.refresh")}
                  </Button>
                  <Button
                    variant="outlined"
                    endIcon={<OpenInNewIcon />}
                    onClick={handleOpenCodexDocumentation}
                  >
                    {t("onboarding.codexDocs")}
                  </Button>
                </Stack>
              </Stack>
            </Paper>

            <Paper className="onboarding-check" variant="outlined">
              <Stack spacing={2}>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                  {gitStatusIcon}
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h6" component="h2">
                      {t("onboarding.gitTitle")}
                    </Typography>
                    <Typography variant="body2" color={isGitReady ? "success.main" : "warning.main"}>
                      {gitStatusText}
                    </Typography>
                  </Box>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {t("onboarding.gitDescription")}
                </Typography>
                <Alert severity="info" variant="outlined">
                  {t("onboarding.gitOptional")}
                </Alert>
                <Button
                  variant={gitRefreshVariant}
                  startIcon={<RefreshIcon />}
                  onClick={handleRefreshGit}
                  disabled={isCheckingGit}
                  sx={{ alignSelf: "flex-start" }}
                >
                  {t("onboarding.refresh")}
                </Button>
              </Stack>
            </Paper>
          </Stack>

          <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
            <Button variant="contained" onClick={handleFinish} disabled={!isCodexUsable}>
              {t("onboarding.finish")}
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}

export const OnboardingViewX = observer(OnboardingView);

function getDefaultSource(sources: OpenCodexSource[], defaultSourceId: string | null): OpenCodexSource | null {
  if (sources.length === 0) {
    return null;
  }

  return sources.find((source) => source.id === defaultSourceId) ?? sources[0] ?? null;
}

function getStatusIcon(status: "ready" | "outdated" | "unavailable", isChecking: boolean): ReactNode {
  if (isChecking) {
    return <CircularProgress size={28} />;
  }

  if (status === "ready") {
    return <CheckCircleOutlineOutlinedIcon color="success" fontSize="large" />;
  }

  if (status === "outdated") {
    return <ErrorOutlineOutlinedIcon color="warning" fontSize="large" />;
  }

  return <ErrorOutlineOutlinedIcon color="error" fontSize="large" />;
}

function getCodexStatusText(
  status: "ready" | "outdated" | "unavailable",
  version: string,
  translate: ReturnType<typeof useTranslation>["t"]
): string {
  if (status === "ready") {
    return translate("onboarding.codexReady", { version });
  }

  if (status === "outdated") {
    return translate("onboarding.codexOutdatedStatus", { version });
  }

  return translate("onboarding.codexMissing");
}
