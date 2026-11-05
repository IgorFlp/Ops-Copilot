# Research: History Summarization

## Decision 1: Fixed window of eight, superseding the twelve-message copy

**Decision**: `runChat` always selects the eight most recent prior messages as
verbatim history. `HISTORY_MESSAGES_THRESHOLD` is still parsed and rejected
when invalid, so existing startup configuration behavior remains, but its
numeric value is not used to choose prompt history. `historyMessages` is the
count of those verbatim messages and is therefore at most eight.

**Rationale**: The specification fixes both the verbatim window and the summary
batch at eight, and it says the earlier threshold must not remain a second,
larger verbatim copy.

**Alternatives considered**:

- Keep using the threshold as the window: rejected because a value of 12 would
  copy messages the summary feature is supposed to prune.
- Remove the environment variable in this feature: rejected because invalid
  configuration should still fail explicitly, and deleting the parser is a
  wider configuration change than this feature needs.

## Decision 2: One coverage cursor and batches of the oldest eight

**Decision**: Persist `covered_through_message_id` with the summary. Messages
with a greater id that are also outside the newest eight are uncovered
departures. Order them oldest first and take the first eight. If fewer than
eight remain, do nothing. If more than eight are overdue, repeat merge, save,
and event until fewer than eight remain. Each save stores the id of the newest
message in that batch.

**Rationale**: Message ids are append-only and ordered inside a conversation.
The cursor makes "only when eight new messages leave" stable across requests
without rereading messages already folded into the summary. Oldest-first
batches keep catch-up deterministic.

**Alternatives considered**:

- Summarize on every request: rejected by the specification.
- Summarize one departed message at a time: rejected because the refresh unit
  is eight messages.
- Re-summarize the entire raw history: rejected because the previous summary
  is the memory of covered messages.

## Decision 3: Merge through an injected summarizer port

**Decision**: `ChatService` depends on a `ConversationSummarizer` port:

- input: the previous summary text or none, plus exactly eight role/content
  messages;
- output: the new summary text and, when the provider reports it, that call's
  prompt-token count.

The default adapter is created only when a batch is due. It calls the existing
`createModel()` with temperature 0 and a provider `maxTokens` of 256. Tests
inject a fake and never call OpenRouter.

The prompt tells the model to write about 150 tokens; to keep decisions,
facts, and still-open pending items; to drop resolved pending items; to keep a
contradicted fact only in its newer form; and to treat the previous summary
and the eight messages as untrusted conversation data rather than
instructions. A pure function builds that prompt so the instruction can be
tested without a model.

**Rationale**: The service already orchestrates chat, while model construction
lives with the agents. Injecting the port satisfies the fake-test requirement
and avoids a provider call on turns that only reuse the saved summary.
`maxTokens` bounds runaway output; the character estimate remains the
acceptance check because provider tokens and the four-character estimate are
not the same measure.

**Alternatives considered**:

- Run summarization as another full strategy: rejected because it would add
  planning, tools, and reflection to a brief rewrite.
- Construct the model for every chat turn: rejected because short
  conversations would then require provider configuration even though no
  summary is due.
- Trust the model length without a local check: rejected because the
  specification caps the saved brief at 200 estimated tokens.

## Decision 4: Accept, save, then continue; failures do not replace the row

**Decision**: Trim the returned summary. Accept it only when
`estimateTokens` is from 1 through 200. Save that trimmed text and the batch's
newest message id with one upsert. Then look for the next batch. If the model
call throws, the text is empty, or the estimate is above 200, throw
`DomainError` with code `INTERNAL` and do not write that update. Batches
already saved earlier in the same turn stay saved. Do not append the current
user message or run the strategy after a failed update, and do not return a
successful chat result.

**Rationale**: Each completed group is a valid summary on its own. Rolling it
back because a later group failed would repeat a successful merge. Stopping
before the user message is appended avoids a stored user turn with no
assistant reply when the failure happened before the answer. The HTTP error
must not include the rejected summary or provider error details.

**Alternatives considered**:

- One transaction around every overdue batch: rejected because a later
  failure would discard earlier accepted merges from the same turn.
- Fall back to the previous summary and still answer: rejected because a
  required refresh would look successful.
- Truncate an overlong summary locally: rejected because cutting the brief
  arbitrarily can drop a decision or a pending item. The turn fails instead.

## Decision 5: Put the summary in context and on the trace, not in the verbatim count

**Decision**: Add optional `conversationSummary` to `ChatStrategyInput`.
`formatStrategyInput` renders it, when present, as a labeled section before
the verbatim history. It is not a history message. `historyMessages` does not
include it. When present, `metrics.contextBreakdown.summary` is its
`estimateTokens` value; the history estimate continues to count only verbatim
message text.

Each accepted save prepends a trace event `{ type: "summarize", content }`
whose content is the saved summary. Events follow batch order and come before
the strategy trace, including the ambiguous-correction trace. A reuse turn
adds none.

**Rationale**: The specification requires the summary to be identifiable
separately from the eight recent messages and requires the event only when a
new summary is saved. A separate breakdown field keeps the existing history
estimate from either hiding or absorbing the summary.

**Alternatives considered**:

- Stuff the summary into `history` as a synthetic message: rejected because
  it would inflate `historyMessages` and blur the verbatim window.
- Emit `summarize` on reuse: rejected because reuse is not a new summary.
- Leave the summary out of `contextBreakdown`: rejected because an included
  context source would then have no estimate.

## Decision 6: Include summarizer usage in `promptTokens` only

**Decision**: When one or more summary calls run, each reported prompt-token
count joins the strategy's model usage under the existing completeness rule:
`metrics.promptTokens` is present only when every strategy invocation and
every summary call reports a non-negative prompt count. `metrics.calls` and
`metrics.latencyMs` remain the strategy values.

**Rationale**: The existing prompt-usage contract sums every model invocation
for the chat request. Omitting the summary call would under-report. Calls and
latency already describe the strategy run; this feature does not redefine
them.

**Alternatives considered**:

- Ignore summarizer usage: rejected because the published prompt total would
  no longer cover every model call.
- Add the summary call to `metrics.calls`: rejected because that metric is the
  strategy call count and this feature does not change it.
