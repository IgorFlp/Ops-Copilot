import type { ChatMetrics } from "../../types/chat";

export interface MetricsSummaryProps {
  metrics: ChatMetrics;
}

export function MetricsSummary({ metrics }: MetricsSummaryProps) {
  const items: { label: string; value: string | number }[] = [
    { label: "Chamadas", value: metrics.calls },
    { label: "Latência", value: `${metrics.latencyMs} ms` },
  ];

  if (metrics.historyMessages !== undefined) {
    items.push({ label: "Histórico", value: metrics.historyMessages });
  }
  if (metrics.promptTokens !== undefined) {
    items.push({ label: "Tokens", value: metrics.promptTokens });
  }
  for (const [key, value] of Object.entries(metrics.contextBreakdown ?? {})) {
    items.push({ label: key, value });
  }

  return (
    <dl className="metrics" aria-label="Métricas da resposta">
      {items.map((item) => (
        <div className="metrics__item" key={item.label}>
          <dt className="metrics__label">{item.label}</dt>
          <dd className="metrics__value">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
