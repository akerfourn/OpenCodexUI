/**
 * Displays the developer-only request and event trace for one Codex turn.
 */
import BugReportOutlinedIcon from "@mui/icons-material/BugReportOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Stack,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexTurnDiagnostic,
  OpenCodexTurnDiagnosticInput,
  OpenCodexTurnDiagnosticRequest
} from "@open-codex-ui/opencodex-protocol";

import { CopyIconButton } from "../common/CopyIconButton";
import type { RootStore } from "../../stores/RootStore";
import { TurnDiagnosticEventList } from "./TurnDiagnosticEventList";

type TurnDiagnosticDialogProps = {
  open: boolean;
  threadId: string;
  sourceId: string | null;
  turnId: string;
  store: RootStore;
  onClose(): void;
};

/** Renders one source-aware developer diagnostic dialog. */
export function TurnDiagnosticDialog({
  open,
  threadId,
  sourceId,
  turnId,
  store,
  onClose
}: TurnDiagnosticDialogProps) {
  const { t } = useTranslation();
  const diagnosticStore = store.chatTurnDiagnosticStore;
  const diagnostic = diagnosticStore.diagnostic;

  useEffect(() => {
    if (open) {
      diagnosticStore.open(threadId, sourceId, turnId);
      return;
    }

    diagnosticStore.close();
  }, [diagnosticStore, open, sourceId, threadId, turnId]);

  function handleClose(): void {
    diagnosticStore.close();
    onClose();
  }

  function handleRefresh(): void {
    void diagnosticStore.refresh();
  }

  const body = diagnosticStore.isLoading && diagnostic === null ? (
    <Stack spacing={1} sx={{ alignItems: "center", justifyContent: "center", minHeight: 260 }}>
      <CircularProgress size={26} />
      <Typography color="text.secondary">{t("turnDiagnostics.loading")}</Typography>
    </Stack>
  ) : (
    <Stack spacing={2}>
      {diagnosticStore.error !== null ? (
        <Alert severity="error">
          {t("turnDiagnostics.loadError", { message: diagnosticStore.error })}
        </Alert>
      ) : null}
      {diagnostic === null ? (
        <Typography color="text.secondary" sx={{ p: 3, textAlign: "center" }}>
          {t("turnDiagnostics.empty")}
        </Typography>
      ) : (
        <TurnDiagnosticContent diagnostic={diagnostic} />
      )}
    </Stack>
  );

  return (
    <Dialog
      open={open}
      fullWidth
      maxWidth="lg"
      onClose={handleClose}
      sx={{ "& .MuiDialog-paper": { maxHeight: "calc(100vh - 48px)" } }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
          <BugReportOutlinedIcon color="primary" sx={{ mt: 0.25 }} />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="h6" component="div">
              {t("turnDiagnostics.title")}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ overflowWrap: "anywhere" }}
            >
              {t("turnDiagnostics.turn")}: {turnId}
            </Typography>
          </Box>
          {diagnostic !== null ? (
            <CopyIconButton
              value={serializeDiagnostic(diagnostic)}
              label={t("turnDiagnostics.copy")}
              copiedLabel={t("message.copied")}
            />
          ) : null}
          <IconButton
            aria-label={t("turnDiagnostics.refresh")}
            title={t("turnDiagnostics.refresh")}
            disabled={diagnosticStore.isLoading}
            onClick={handleRefresh}
          >
            {diagnosticStore.isLoading
              ? <CircularProgress size={20} />
              : <RefreshOutlinedIcon />}
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent dividers sx={{ overflowY: "auto" }}>
        {body}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{t("turnDiagnostics.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}

/** Renders the stable sections of a loaded turn diagnostic. */
function TurnDiagnosticContent({ diagnostic }: { diagnostic: OpenCodexTurnDiagnostic }) {
  const { t } = useTranslation();
  const statusLabel = diagnostic.status === "active"
    ? t("turnDiagnostics.active")
    : diagnostic.status === "completed"
      ? t("turnDiagnostics.completed")
      : diagnostic.status === "failed"
        ? t("turnDiagnostics.failed")
        : diagnostic.status === "pending"
          ? t("turnDiagnostics.pending")
          : t("turnDiagnostics.observed");

  return (
    <>
      <Box
        sx={{
          display: "grid",
          gap: 1,
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))"
        }}
      >
        <SummaryCard label={t("turnDiagnostics.status")} value={statusLabel} />
        <SummaryCard label={t("turnDiagnostics.source")} value={diagnostic.sourceId ?? t("turnDiagnostics.noValue")} />
        <SummaryCard label={t("turnDiagnostics.thread")} value={diagnostic.threadId} />
        <SummaryCard
          label={t("turnDiagnostics.turn")}
          value={diagnostic.turnId ?? t("turnDiagnostics.noValue")}
        />
        <SummaryCard
          label={t("turnDiagnostics.events")}
          value={t("turnDiagnostics.eventCount", { count: diagnostic.events.length })}
        />
      </Box>

      <DiagnosticSection title={t("turnDiagnostics.requests")}>
        <Stack spacing={1.25}>
          {diagnostic.requests.map((request, index) => (
            <TurnDiagnosticRequestCard
              key={`${request.requestType}-${request.capturedAt}-${index}`}
              request={request}
              number={index + 1}
            />
          ))}
        </Stack>
      </DiagnosticSection>

      <DiagnosticSection title={t("turnDiagnostics.output")}>
        <DetailRows
          rows={[
            [
              t("turnDiagnostics.assistantMessages"),
              diagnostic.response.assistantMessageIds.join(", ") || t("turnDiagnostics.noValue")
            ],
            [t("turnDiagnostics.outputDeltaCount"), String(diagnostic.response.outputDeltaCount)],
            [t("turnDiagnostics.outputLength"), String(diagnostic.response.outputLength)],
            [t("turnDiagnostics.outputHash"), diagnostic.response.outputHash ?? t("turnDiagnostics.noValue")]
          ]}
        />
      </DiagnosticSection>

      {diagnostic.anomalies.length > 0 ? (
        <Alert severity="warning">
          <Typography variant="subtitle2">{t("turnDiagnostics.anomalies")}</Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {diagnostic.anomalies.map((anomaly) => <li key={anomaly}>{anomaly}</li>)}
          </Box>
        </Alert>
      ) : null}

      {diagnostic.truncated ? (
        <Alert severity="info">{t("turnDiagnostics.truncated")}</Alert>
      ) : null}

      <DiagnosticSection title={t("turnDiagnostics.chronology")}>
        <TurnDiagnosticEventList events={diagnostic.events} />
      </DiagnosticSection>
    </>
  );
}

/** Renders one request's exact input and execution parameters. */
function TurnDiagnosticRequestCard({
  request,
  number
}: {
  request: OpenCodexTurnDiagnosticRequest;
  number: number;
}) {
  const { t } = useTranslation();
  const statusLabel = request.response.status === "succeeded"
    ? t("turnDiagnostics.succeeded")
    : request.response.status === "failed"
      ? t("turnDiagnostics.failed")
      : t("turnDiagnostics.pending");

  return (
    <Paper variant="outlined" sx={{ minWidth: 0, p: 1.5 }}>
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="subtitle2">
            {t("turnDiagnostics.requestNumber", { number })}
          </Typography>
          <Chip size="small" label={statusLabel} color={request.response.status === "failed" ? "error" : "default"} />
        </Stack>
        <DetailRows
          rows={[
            [t("turnDiagnostics.requestType"), request.requestType],
            [t("turnDiagnostics.rpcMethod"), request.rpcMethod],
            [t("turnDiagnostics.capturedAt"), formatDiagnosticTime(request.capturedAt)],
            [t("turnDiagnostics.model"), request.model ?? t("turnDiagnostics.noValue")],
            [t("turnDiagnostics.reasoning"), request.reasoningEffort ?? t("turnDiagnostics.noValue")],
            [t("turnDiagnostics.serviceTier"), request.serviceTier ?? t("turnDiagnostics.noValue")],
            [
              t("turnDiagnostics.resumed"),
              request.resumedExistingThread
                ? t("turnDiagnostics.yes")
                : t("turnDiagnostics.no")
            ],
            [t("turnDiagnostics.textHash"), request.textHash],
            [t("turnDiagnostics.inputElementCount"), String(request.input.length)],
            [t("turnDiagnostics.response"), request.response.errorMessage ?? statusLabel]
          ]}
        />
        <InputElements input={request.input} />
      </Stack>
    </Paper>
  );
}

/** Renders the input elements while keeping image contents redacted. */
function InputElements({ input }: { input: OpenCodexTurnDiagnosticInput[] }) {
  const { t } = useTranslation();

  return (
    <Stack spacing={0.75}>
      <Typography variant="subtitle2">{t("turnDiagnostics.input")}</Typography>
      {input.map((element, index) => {
        const label = element.type === "text"
          ? t("turnDiagnostics.textSent")
          : element.type === "skill"
            ? t("turnDiagnostics.inputElementSkill")
            : element.type === "image"
              ? t("turnDiagnostics.inputElementImage")
              : t("turnDiagnostics.inputElementLocalImage");
        const value = element.type === "text"
          ? element.text
          : element.type === "skill"
            ? `${element.name} (${element.path})`
            : element.type === "image"
              ? `${element.valueLength} bytes of data URL metadata`
              : element.path;

        return (
          <Box key={`${element.type}-${index}`} sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
            <Typography
              component="pre"
              variant="body2"
              sx={{
                bgcolor: "action.hover",
                borderRadius: 1,
                m: 0,
                maxHeight: 180,
                overflow: "auto",
                p: 1,
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere"
              }}
            >
              {value}
            </Typography>
          </Box>
        );
      })}
    </Stack>
  );
}

/** Renders a titled diagnostic section with consistent spacing. */
function DiagnosticSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box component="section" sx={{ minWidth: 0 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.75 }}>
        {title}
      </Typography>
      <Divider sx={{ mb: 1 }} />
      {children}
    </Box>
  );
}

/** Renders one compact label/value summary card. */
function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Paper variant="outlined" sx={{ minWidth: 0, p: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
        {value}
      </Typography>
    </Paper>
  );
}

/** Renders aligned label/value rows for compact diagnostic metadata. */
function DetailRows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <Stack divider={<Divider flexItem />} spacing={0}>
      {rows.map(([label, value]) => (
        <Box
          key={label}
          sx={{
            display: "grid",
            gap: 1,
            gridTemplateColumns: "minmax(140px, 30%) minmax(0, 1fr)",
            py: 0.65
          }}
        >
          <Typography variant="body2" color="text.secondary">{label}</Typography>
          <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>{value}</Typography>
        </Box>
      ))}
    </Stack>
  );
}

/** Serializes a diagnostic for copy/paste into a bug report. */
function serializeDiagnostic(diagnostic: OpenCodexTurnDiagnostic): string {
  return JSON.stringify(diagnostic, null, 2);
}

/** Formats a captured timestamp for human inspection. */
function formatDiagnosticTime(value: string): string {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? value : timestamp.toLocaleString();
}

export const TurnDiagnosticDialogX = observer(TurnDiagnosticDialog);
