# Contract: Chat Context

Additive behavior of the existing `POST /chat` success response. Request
fields and error status mapping are unchanged. Field definitions are in
[data-model.md](../data-model.md).

## Context sent to the strategy

Before the strategy runs, the service updates the summary for prior stored
messages as specified in
[conversation-summary.md](./conversation-summary.md). The strategy input then
contains:

1. `conversationSummary`, only when a saved summary exists after those updates.
2. `history`, the newest eight prior messages, oldest first. This array is
   never longer than eight, regardless of `HISTORY_MESSAGES_THRESHOLD`.
3. The current `message` and any recalled memories, unchanged.

`formatStrategyInput` places the summary in its own labeled section ahead of
the verbatim history. It does not render the summary as a user or assistant
history line.

## Trace

`trace` may include events whose `type` is `summarize`. Each such event's
`content` is a summary saved during that turn. Zero events means no summary
was saved. Several overdue batches produce several events, oldest batch first.
Those events precede the strategy's own trace events.

Existing event types remain valid.

## Metrics

| Field | Change |
|---|---|
| `metrics.historyMessages` | Still required. Now an integer from 0 through 8 and equal to `history.length` |
| `metrics.contextBreakdown.history` | Still the estimate for verbatim history text only. Omitted when history is empty |
| `metrics.contextBreakdown.summary` | New optional integer. Present only when `conversationSummary` was included. Estimated from that summary alone |
| `metrics.contextBreakdown.currentMessage` and `memories` | Unchanged |
| `metrics.promptTokens` | Still omitted unless every model call for the turn reports prompt usage. Summary-model calls count toward that rule |
| `metrics.calls` and `metrics.latencyMs` | Unchanged |

`contextBreakdown.summary` is not added to `history` and is not added into
`historyMessages`.

## Errors

A summary update that fails or produces text outside the accepted length is a
chat failure. The response uses the existing domain-error translation, does
not echo the summary, and does not include a `summarize` event for the
rejected update.
