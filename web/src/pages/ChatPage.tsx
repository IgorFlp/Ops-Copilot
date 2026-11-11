import { useMemo, useState } from "react";
import { ApprovalCard } from "../components/approval/ApprovalCard";
import { ChatComposer } from "../components/chat/ChatComposer";
import { MessageList } from "../components/chat/MessageList";
import { StrategySelect } from "../components/chat/StrategySelect";
import { TracePanel } from "../components/trace/TracePanel";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { Spinner } from "../components/ui/Spinner";
import { useApiConfig } from "../hooks/useApiConfig";
import { useChat } from "../hooks/useChat";
import { useStrategy } from "../hooks/useStrategy";
import { createApiClient } from "../lib/api-client";
import { DEFAULT_USER_ID } from "../lib/config";
import type { TraceEvent } from "../types/trace";

export function ChatPage() {
  const { baseUrl } = useApiConfig();
  const client = useMemo(() => createApiClient(() => baseUrl), [baseUrl]);
  const { strategy, setStrategy } = useStrategy();
  const {
    messages,
    sending,
    error,
    pending,
    send,
    retry,
    decide,
    clearError,
  } = useChat({ client, userId: DEFAULT_USER_ID, strategy });
  const [trace, setTrace] = useState<TraceEvent[] | null>(null);

  const canRetry = messages.some(
    (message) => message.role === "user" && message.status === "failed",
  );
  const showEmptyState = messages.length === 0 && !sending && !error;

  return (
    <section className="chat" aria-labelledby="chat-heading">
      <h1 id="chat-heading" className="visually-hidden">
        Chat do copiloto
      </h1>

      {showEmptyState ? (
        <EmptyState
          title="Comece a conversa"
          description="Envie uma mensagem para o copiloto sobre alertas e incidentes."
        />
      ) : (
        <MessageList messages={messages} onViewTrace={setTrace} />
      )}

      {sending ? (
        <div role="status" aria-live="polite">
          <Spinner label="Aguardando resposta do copiloto" />
        </div>
      ) : null}

      {pending ? <ApprovalCard pending={pending} onDecide={decide} /> : null}

      {error ? (
        <ErrorState
          title="Não foi possível enviar"
          message={error.message}
          action={
            canRetry ? (
              <Button variant="secondary" onClick={retry}>
                Tentar novamente
              </Button>
            ) : (
              <Button variant="secondary" onClick={clearError}>
                Fechar
              </Button>
            )
          }
        />
      ) : null}

      <StrategySelect
        value={strategy}
        onChange={setStrategy}
        disabled={sending}
      />

      <ChatComposer onSend={send} disabled={sending} />

      <TracePanel
        trace={trace}
        open={trace !== null}
        onClose={() => setTrace(null)}
      />
    </section>
  );
}
