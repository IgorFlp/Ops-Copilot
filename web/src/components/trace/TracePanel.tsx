import type { TraceEvent } from "../../types/trace";
import { Dialog } from "../ui/Dialog";
import { EmptyState } from "../ui/EmptyState";
import { TraceEventItem } from "./TraceEventItem";

export interface TracePanelProps {
  trace: TraceEvent[] | null;
  open: boolean;
  onClose(): void;
}

export function TracePanel({ trace, open, onClose }: TracePanelProps) {
  const events = trace ?? [];

  return (
    <Dialog open={open} title="Raciocínio" onClose={onClose}>
      {events.length > 0 ? (
        <ol className="trace-list">
          {events.map((event, index) => (
            <TraceEventItem key={`${index}-${event.type}`} event={event} />
          ))}
        </ol>
      ) : (
        <EmptyState
          title="Sem raciocínio registrado"
          description="Esta resposta não incluiu eventos de raciocínio."
        />
      )}
    </Dialog>
  );
}
