import { observer } from "mobx-react-lite";

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
    <div className="modal-backdrop">
      <section className="approval-dialog" role="dialog" aria-modal="true">
        <header>
          <h2>Approbation requise</h2>
          <p>{approval.title}</p>
        </header>
        <pre>{approval.body}</pre>
        <div className="approval-actions">
          {approval.choices.map((decision) => (
            <ApprovalButton
              decision={decision}
              key={decision}
              approvalId={approval.id}
              store={store}
            />
          ))}
        </div>
      </section>
    </div>
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
    <button type="button" onClick={handleDecision}>
      {labelDecision(decision)}
    </button>
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
