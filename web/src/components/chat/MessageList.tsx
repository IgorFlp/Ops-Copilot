import type { ChatMessage } from "../../types/chat";
import type { TraceEvent } from "../../types/trace";
import { Button } from "../ui/Button";
import { MetricsSummary } from "./MetricsSummary";

export interface MessageListProps {
  messages: ChatMessage[];
  onViewTrace(trace: TraceEvent[]): void;
}

export function MessageList({ messages, onViewTrace }: MessageListProps) {
  return (
    <div
      className="chat__messages"
      role="log"
      aria-live="polite"
      aria-label="Conversa"
    >
      {messages.map((message) => (
        <article
          key={message.id}
          className={[
            "message",
            message.role === "user"
              ? "message--user"
              : "message--assistant",
          ].join(" ")}
        >
          <p className="message__role">
            {message.role === "user" ? "Você" : "Copiloto"}
          </p>
          <p className="message__content">
            {message.content.length > 0
              ? message.content
              : message.status === "sending"
                ? "Enviando…"
                : ""}
          </p>

          {message.role === "assistant" && message.metrics ? (
            <MetricsSummary metrics={message.metrics} />
          ) : null}

          <div className="message__meta">
            {message.requestId ? (
              <span className="message__request-id">
                ID: {message.requestId}
              </span>
            ) : null}
            {message.status === "failed" ? (
              <span className="badge badge--danger">Falhou</span>
            ) : null}
            {message.role === "assistant" && message.trace ? (
              <Button
                variant="secondary"
                onClick={() => onViewTrace(message.trace ?? [])}
              >
                Ver raciocínio
              </Button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
