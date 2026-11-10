import type {
  ApprovalDecision,
  PendingApprovalState,
} from "../../types/approval";
import { Button } from "../ui/Button";

export interface ApprovalCardProps {
  pending: PendingApprovalState;
  onDecide(decision: ApprovalDecision): void;
}

export function ApprovalCard({ pending, onDecide }: ApprovalCardProps) {
  const busy = pending.status === "submitting";
  const decided =
    pending.status === "approved" || pending.status === "denied";

  return (
    <section className="approval-card" aria-label="Aprovação pendente">
      <p className="approval-card__title">Aprovação necessária</p>
      <p className="approval-card__summary">
        {pending.action.summary ?? pending.action.tool}
      </p>
      <p>
        Ferramenta: <strong>{pending.action.tool}</strong>
      </p>
      {pending.action.args ? (
        <pre className="approval-card__args">
          {JSON.stringify(pending.action.args, null, 2)}
        </pre>
      ) : null}

      {decided ? (
        <p className="approval-card__status" role="status">
          {pending.status === "approved" ? "Aprovado" : "Negado"}
        </p>
      ) : (
        <div className="approval-card__actions">
          <Button
            variant="primary"
            onClick={() => onDecide("approve")}
            disabled={busy}
            loading={busy}
          >
            Aprovar
          </Button>
          <Button
            variant="danger"
            onClick={() => onDecide("deny")}
            disabled={busy}
          >
            Negar
          </Button>
        </div>
      )}

      {pending.status === "failed" && pending.error ? (
        <p className="field__error" role="alert">
          {pending.error} Tente novamente.
        </p>
      ) : null}
    </section>
  );
}
