/**
 * Renders the approval dialog component for the OpenCodex UI.
 */
import { observer } from "mobx-react-lite";
import { Box, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

import type { RootStore } from "../../stores/RootStore";
import { ApprovalButton } from "./ApprovalButton";

type ApprovalDialogProps = {
  store: RootStore;
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
  const approval = store.approvals[0];

  if (approval === undefined) {
    return null;
  }

  return (
    <Dialog open maxWidth="md" fullWidth>
      <Box component="section">
        <DialogTitle>{t("approval.required")}</DialogTitle>
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
}

export const ApprovalDialogX = observer(ApprovalDialog);
