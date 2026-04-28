import { Button } from "@mui/material";

import type { OpenCodexApprovalDecision } from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../stores/RootStore";

type ApprovalButtonProps = {
  store: RootStore;
  approvalId: string;
  decision: OpenCodexApprovalDecision;
};

export function ApprovalButton({ store, approvalId, decision }: ApprovalButtonProps) {
  function handleDecision(): void {
    store.resolveApproval(approvalId, decision);
  }

  return (
    <Button
      type="button"
      variant={decision === "decline" || decision === "cancel" ? "outlined" : "contained"}
      onClick={handleDecision}
    >
      {labelDecision(decision)}
    </Button>
  );
}

function labelDecision(decision: OpenCodexApprovalDecision): string {
  if (decision === "accept") {
    return "Accepter";
  }

  if (decision === "acceptForSession") {
    return "Accepter pour la session";
  }

  if (decision === "decline") {
    return "Refuser";
  }

  return "Annuler";
}
