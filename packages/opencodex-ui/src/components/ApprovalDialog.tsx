import { observer } from "mobx-react-lite";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";

import type { RootStore } from "../stores/RootStore";

type ApprovalDialogProps = {
  store: RootStore;
};

export const ApprovalDialog = observer(function ApprovalDialog({ store }: ApprovalDialogProps) {
  const approval = store.approvals[0];

  if (approval === undefined) {
    return null;
  }

  return (
    <Dialog open maxWidth="md" fullWidth>
      <Box component="section">
        <DialogTitle>Approbation requise</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {approval.title}
          </Typography>
          <Box
            component="pre"
            sx={{
              m: 0,
              maxHeight: "50vh",
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily:
                'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace',
              fontSize: 13,
              lineHeight: 1.5
            }}
          >
            {approval.body}
          </Box>
        </DialogContent>
        <DialogActions>
          {approval.choices.map((decision) => (
            <ApprovalButton
              approvalId={approval.id}
              decision={decision}
              key={decision}
              store={store}
            />
          ))}
        </DialogActions>
      </Box>
    </Dialog>
  );
});

type ApprovalButtonProps = {
  store: RootStore;
  approvalId: string;
  decision: NonNullable<RootStore["approvals"][number]>["choices"][number];
};

const ApprovalButton = observer(function ApprovalButton({
  store,
  approvalId,
  decision
}: ApprovalButtonProps) {
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
});

function labelDecision(decision: ApprovalButtonProps["decision"]): string {
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
