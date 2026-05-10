/**
 * Renders the approval dialog component for the OpenCodex UI.
 */
import { observer } from "mobx-react-lite";
import TerminalOutlinedIcon from "@mui/icons-material/TerminalOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import GppMaybeOutlinedIcon from "@mui/icons-material/GppMaybeOutlined";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  Typography
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

import type { OpenCodexApproval } from "@open-codex-ui/opencodex-protocol";

import type { ApprovalsStore } from "../../stores/ApprovalsStore";
import { CopyIconButton } from "../common/CopyIconButton";
import { ApprovalDetailRow } from "./ApprovalDetailRow";
import { ApprovalButton } from "./ApprovalButton";

type ApprovalDialogProps = {
  store: ApprovalsStore;
};

/**
 * Renders the approval dialog component.
 *
 * @param props Component props.
 *
 * @returns Nothing.
 */
export function ApprovalDialog({ store }: ApprovalDialogProps) {
  const { t } = useTranslation();
  const approval = store.currentApproval;

  if (approval === null) {
    return null;
  }

  const approvalIcon = getApprovalIcon(approval.kind);
  const approvalHeading = t(`approval.${approval.kind}`);
  const approvalDescription = t(`approval.${approval.kind}Description`);
  const details = getApprovalDetails(approval, t);

  return (
    <Dialog open maxWidth="md" fullWidth>
      <Box component="section">
        <DialogTitle>{t("approval.required")}</DialogTitle>
        <DialogContent dividers>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 280px" },
              gap: 2.5,
              alignItems: "start"
            }}
          >
            <Stack spacing={2.25}>
              <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
                <Box
                  aria-hidden
                  sx={{
                    display: "grid",
                    placeItems: "center",
                    width: 36,
                    height: 36,
                    borderRadius: 1,
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                    flex: "0 0 auto"
                  }}
                >
                  {approvalIcon}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {approvalHeading}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {approvalDescription}
                  </Typography>
                </Box>
              </Box>

              {approval.reason !== null && approval.reason !== undefined ? (
                <ApprovalDetailRow label={t("approval.reason")} value={approval.reason} />
              ) : null}

              <Stack spacing={1.5}>
                {details.map((detail) => (
                  <ApprovalDetailRow
                    key={detail.label}
                    label={detail.label}
                    value={detail.value}
                    monospace={detail.monospace}
                  />
                ))}
              </Stack>

              <Accordion disableGutters variant="outlined" sx={{ "&:before": { display: "none" } }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography variant="body2">{t("approval.rawDetails")}</Typography>
                    <CopyIconButton
                      value={approval.body}
                      label={t("approval.copyRaw")}
                      copiedLabel={t("message.copied")}
                      buttonSize={22}
                      iconSize={14}
                    />
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Box
                    component="pre"
                    sx={{
                      m: 0,
                      maxHeight: "30vh",
                      overflow: "auto",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontFamily:
                        'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace',
                      fontSize: 12,
                      lineHeight: 1.5
                    }}
                  >
                    {approval.body}
                  </Box>
                </AccordionDetails>
              </Accordion>
            </Stack>
            <Box
              component="aside"
              sx={{
                borderLeft: { xs: 0, md: "1px solid" },
                borderTop: { xs: "1px solid", md: 0 },
                borderColor: "divider",
                pl: { xs: 0, md: 2.5 },
                pt: { xs: 2, md: 0 }
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                {t("approval.availableActions")}
              </Typography>
              <Stack spacing={1}>
                {approval.choices.map((decision) => (
                  <ApprovalButton
                    approvalId={approval.id}
                    decision={decision}
                    key={getApprovalDecisionKey(decision)}
                    store={store}
                  />
                ))}
              </Stack>
            </Box>
          </Box>
        </DialogContent>
      </Box>
    </Dialog>
  );
}

export const ApprovalDialogX = observer(ApprovalDialog);

type ApprovalDetail = {
  label: string;
  value: string;
  monospace?: boolean;
};

function getApprovalDetails(
  approval: OpenCodexApproval,
  translate: (key: string) => string
): ApprovalDetail[] {
  const details: ApprovalDetail[] = [];

  if (approval.kind === "command") {
    addDetail(details, "approval.command", approval.command ?? approval.title, true);
    addDetail(details, "approval.cwd", approval.cwd, true);
    return localizeDetailLabels(details, translate);
  }

  if (approval.kind === "fileChange") {
    addDetail(details, "approval.grantRoot", approval.grantRoot ?? approval.title, true);
    return localizeDetailLabels(details, translate);
  }

  if (approval.kind === "permissions") {
    addDetail(details, "approval.cwd", approval.cwd, true);
    addDetail(details, "approval.permissions", stringifyUnknown(approval.permissions), true);
    return localizeDetailLabels(details, translate);
  }

  addDetail(details, "approval.other", approval.title);
  return localizeDetailLabels(details, translate);
}

function addDetail(
  details: ApprovalDetail[],
  label: string,
  value: string | null | undefined,
  monospace = false
): void {
  if (value === null || value === undefined || value.trim().length === 0) {
    return;
  }

  details.push({ label, value, monospace });
}

function localizeDetailLabels(
  details: ApprovalDetail[],
  translate: (key: string) => string
): ApprovalDetail[] {
  return details.map((detail) => ({
    ...detail,
    label: translate(detail.label)
  }));
}

function stringifyUnknown(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

function getApprovalIcon(kind: OpenCodexApproval["kind"]): ReactNode {
  if (kind === "command") {
    return <TerminalOutlinedIcon fontSize="small" />;
  }

  if (kind === "fileChange") {
    return <DescriptionOutlinedIcon fontSize="small" />;
  }

  if (kind === "permissions") {
    return <GppMaybeOutlinedIcon fontSize="small" />;
  }

  return <HelpOutlineOutlinedIcon fontSize="small" />;
}

function getApprovalDecisionKey(decision: OpenCodexApproval["choices"][number]): string {
  return typeof decision === "string" ? decision : JSON.stringify(decision);
}
