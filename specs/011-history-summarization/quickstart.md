# History Summarization Quickstart

Validate the eight-message window, batched merge, persisted summary, strategy
context, and `summarize` event without a live model provider.
The model prompt asks for a terse Portuguese summary of at most 150 tokens,
preserving decisions, established facts, incident states, and open items.
Prior summaries and transcript messages are explicitly treated as untrusted
conversation data.

## Prerequisites

- Node.js 22.13+ and the repository dependencies.
- No `.env` values, provider credentials, or external database.

The behavior under test is defined in [data-model.md](./data-model.md),
[contracts/conversation-summary.md](./contracts/conversation-summary.md), and
[contracts/chat-context.md](./contracts/chat-context.md).

## Focused validation

Run the deterministic tests:

```powershell
node --import tsx --test src/context/history-summary.test.ts src/store/sqlite-conversation-store.test.ts src/services/chat-service.test.ts
```

Run type checking and the complete suite:

```powershell
npm run typecheck
npm test
```

## Scenarios

1. **Short conversation.** With eight or fewer stored prior messages, the
   stand-in summarizer is not called, no summary row is written, the trace has
   no `summarize` event, and every prior message is verbatim history.
2. **Incomplete batch.** With a saved summary and only seven newer messages
   outside the recent window, the summarizer is not called and the saved text
   and coverage cursor stay the same.
3. **First and merged refresh.** When eight messages have left the window,
   the summarizer receives those eight oldest uncovered messages and the
   previous summary when one exists. The store replaces the single
   `conversation_summaries` row, the next answer context includes that summary
   plus only the eight newest prior messages, and the trace contains one
   `summarize` event whose content is the saved summary.
4. **Catch-up.** When sixteen uncovered messages have left the window, the
   stand-in is called twice. The second call receives the first call's
   summary. Two events are recorded in that order.
5. **Rejected summary.** A stand-in result that is empty or estimates above
   200 tokens fails the turn, does not replace the previous row, and does not
   produce a successful chat response.
6. **Isolation.** A summary saved for one conversation is not returned for
   another.

## Expected checks

- `historyMessages` equals the verbatim count and is never greater than 8.
- `contextBreakdown.summary` is present only when a summary was placed in
  context, and the history estimate does not include that summary text.
- Turns that do not complete a batch perform no summary model call.
- The suite does not contact a live model provider.
