/**
 * Renders the approval button component for the OpenCodex UI.
 */
import { Button } from "@mui/material";
import { useTranslation } from "react-i18next";

import type { OpenCodexApprovalDecision } from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../stores/RootStore";

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

  function handleDecision(): void {
    store.resolveApproval(approvalId, decision);
  }

  return (
    <Button
      type="button"
      variant={decision === "decline" || decision === "cancel" ? "outlined" : "contained"}
      onClick={handleDecision}
    >
      {t(`approval.${decision}`)}
    </Button>
  );
}
