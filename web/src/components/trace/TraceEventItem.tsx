import { isKnownTraceEventType, type TraceEvent } from "../../types/trace";

const TYPE_LABELS: Record<string, string> = {
  thought: "Pensamento",
  action: "Ação",
  observation: "Observação",
  plan: "Plano",
  critique: "Crítica",
  answer: "Resposta",
  summarize: "Resumo",
  route: "Roteamento",
  context: "Contexto",
  fallback: "Fallback",
};

export interface TraceEventItemProps {
  event: TraceEvent;
}

export function TraceEventItem({ event }: TraceEventItemProps) {
  const known = isKnownTraceEventType(event.type);
  const label = known
    ? (TYPE_LABELS[event.type] ?? event.type)
    : `Evento: ${event.type}`;

  const hasTools = (event.tools?.length ?? 0) > 0;
  const hasArgs = event.args !== undefined;
  const hasApproval = event.approved !== undefined;
  const hasDetails = hasTools || hasArgs || hasApproval;

  return (
    <li className="trace-event">
      <div className="trace-event__header">
        <span className="trace-event__type">{label}</span>
        <span className="trace-event__node">
          {event.node ? `nó: ${event.node}` : ""}
          {event.timestamp ? ` · ${event.timestamp}` : ""}
        </span>
      </div>
      <p className="trace-event__content">{event.content}</p>
      {hasDetails ? (
        <dl className="trace-event__details">
          {hasTools ? (
            <>
              <dt>Ferramentas</dt>
              <dd>{event.tools?.join(", ")}</dd>
            </>
          ) : null}
          {hasArgs ? (
            <>
              <dt>Argumentos</dt>
              <dd>{JSON.stringify(event.args)}</dd>
            </>
          ) : null}
          {hasApproval ? (
            <>
              <dt>Aprovado</dt>
              <dd>{String(event.approved)}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
    </li>
  );
}
