/**
 * Renders the approval button component for the OpenCodex UI.
 */
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
  const buttonVariant = getApprovalButtonVariant(decision);

  function handleDecision(): void {
    store.resolveApproval(approvalId, decision);
  }

  return (
    <Button
      type="button"
      color={buttonColor}
      variant={buttonVariant}
      onClick={handleDecision}
    >
      {t(`approval.${decision}`)}
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

  return "primary";
}

function getApprovalButtonVariant(decision: OpenCodexApprovalDecision): "contained" | "outlined" {
  if (decision === "cancel" || decision === "acceptForSession") {
    return "outlined";
  }

  return "contained";
}
