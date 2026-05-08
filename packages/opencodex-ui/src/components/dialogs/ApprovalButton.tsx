/**
 * Renders the approval button component for the OpenCodex UI.
 */
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import DoneAllOutlinedIcon from "@mui/icons-material/DoneAllOutlined";
import GavelOutlinedIcon from "@mui/icons-material/GavelOutlined";
import LanguageOutlinedIcon from "@mui/icons-material/LanguageOutlined";
import { Button } from "@mui/material";
import { useTranslation } from "react-i18next";

import type { OpenCodexApprovalDecision } from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../../stores/RootStore";

type ApprovalButtonProps = {
  store: RootStore;
  approvalId: string;
  decision: OpenCodexApprovalDecision;
};

/**
 * Renders the approval button component.
 *
 * @param props Component props.
 *
 * @returns Nothing.
 */
export function ApprovalButton({ store, approvalId, decision }: ApprovalButtonProps) {
  const { t } = useTranslation();
  const buttonColor = getApprovalButtonColor(decision);
  const buttonLabel = getApprovalButtonLabel(decision, t);
  const buttonIcon = getApprovalButtonIcon(decision);

  function handleDecision(): void {
    store.resolveApproval(approvalId, decision);
  }

  return (
    <Button
      type="button"
      color={buttonColor}
      startIcon={buttonIcon}
      variant="outlined"
      onClick={handleDecision}
      sx={{
        justifyContent: "flex-start",
        borderRadius: "20px",
        px: 1.75,
        py: 1,
        textAlign: "left",
        textTransform: "none"
      }}
    >
      {buttonLabel}
    </Button>
  );
}

function getApprovalButtonColor(
  decision: OpenCodexApprovalDecision
): "primary" | "success" | "error" | "inherit" {
  if (decision === "accept" || decision === "acceptForSession") {
    return "success";
  }

  if (decision === "decline") {
    return "error";
  }

  if (decision === "cancel") {
    return "inherit";
  }

  if (
    isNetworkPolicyDecision(decision) &&
    decision.applyNetworkPolicyAmendment.network_policy_amendment.action === "deny"
  ) {
    return "error";
  }

  return "primary";
}

function getApprovalButtonLabel(
  decision: OpenCodexApprovalDecision,
  translate: (key: string, values?: Record<string, string>) => string
): string {
  if (typeof decision === "string") {
    return translate(`approval.${decision}`);
  }

  if (isExecpolicyDecision(decision)) {
    const command = decision.acceptWithExecpolicyAmendment.execpolicy_amendment.join(" ");
    return translate("approval.acceptWithExecpolicyAmendment", { command });
  }

  const amendment = decision.applyNetworkPolicyAmendment.network_policy_amendment;
  const key =
    amendment.action === "allow"
      ? "approval.applyNetworkPolicyAllow"
      : "approval.applyNetworkPolicyDeny";

  return translate(key, { host: amendment.host });
}

function getApprovalButtonIcon(decision: OpenCodexApprovalDecision) {
  if (decision === "accept") {
    return <CheckOutlinedIcon fontSize="small" />;
  }

  if (decision === "acceptForSession") {
    return <DoneAllOutlinedIcon fontSize="small" />;
  }

  if (decision === "decline") {
    return <BlockOutlinedIcon fontSize="small" />;
  }

  if (decision === "cancel") {
    return <CloseOutlinedIcon fontSize="small" />;
  }

  if (isExecpolicyDecision(decision)) {
    return <GavelOutlinedIcon fontSize="small" />;
  }

  return <LanguageOutlinedIcon fontSize="small" />;
}

function isExecpolicyDecision(
  decision: OpenCodexApprovalDecision
): decision is Extract<OpenCodexApprovalDecision, { acceptWithExecpolicyAmendment: unknown }> {
  return typeof decision === "object" && "acceptWithExecpolicyAmendment" in decision;
}

function isNetworkPolicyDecision(
  decision: OpenCodexApprovalDecision
): decision is Extract<OpenCodexApprovalDecision, { applyNetworkPolicyAmendment: unknown }> {
  return typeof decision === "object" && "applyNetworkPolicyAmendment" in decision;
}
