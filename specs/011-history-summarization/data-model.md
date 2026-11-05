# Data Model: History Summarization

## Conversation summary

One current brief for one conversation. A later accepted merge replaces the
row; earlier versions are not kept.

| Field | Storage | Rules |
|---|---|---|
| `conversation_id` | `TEXT` primary key, not null, references `conversations.id` with `ON DELETE CASCADE` | Exactly one row per conversation |
| `content` | `TEXT` not null | Trimmed summary. `estimateTokens(content)` is from 1 through 200. Target length is about 150 tokens |
| `covered_through_message_id` | `INTEGER` not null, references `messages.id` | Id of the newest message folded into this summary. That message belongs to the same conversation |
| `updated_at` | `TEXT` not null | Time of the latest accepted replacement |

The table name is `conversation_summaries`. Absence of a row means the
conversation has no summary and coverage starts at the beginning.

## Coverage and windows

Both sizes are fixed constants: recent window `8`, summary batch `8`.

Messages already stored for the conversation, ordered by ascending `id`:

1. The newest eight are the recent window and stay verbatim.
2. Every older message whose id is greater than `covered_through_message_id`
   (or every older message, when no summary exists) is an uncovered departure.
3. The next batch is the oldest eight uncovered departures. Fewer than eight
   does not produce a batch.
4. After an accepted save, coverage moves to that batch's newest message id.
   The next batch is calculated from the new coverage.

The message sent on the current turn is not in this ordering until it has been
stored. User and assistant messages both count. Messages at or below the
coverage cursor are not sent to the summarizer again.

## Summary update

One accepted batch produces one replacement.

| Input | Rule |
|---|---|
| Previous `content`, if a row exists | Merged into the new brief. Omitted on the first summary |
| Exactly eight uncovered departed messages | Role and content only, oldest first |
| Produced text | Trimmed, then accepted only inside the 1–200 estimated-token range |

A rejected production or a failed write leaves the existing row and cursor
unchanged. Batches already accepted earlier in the same turn remain.

## Strategy context

| Part | Source | Counted in `historyMessages` |
|---|---|---|
| Conversation summary | Saved `content` after any updates required for this turn. Omitted when no row exists | No |
| Verbatim history | Newest eight prior messages, oldest first, role and content | Yes, one per message, maximum eight |
| Current message | The request being answered | No |

The summary is a separate labeled section, not an entry in `history`.

## Trace and metrics

| Field | Rule |
|---|---|
| Trace event `summarize` | One event per accepted save in that turn, in batch order, before the strategy trace. `content` is the saved summary. Absent when no save happens |
| `metrics.historyMessages` | Integer from 0 through 8, equal to verbatim prior messages |
| `metrics.contextBreakdown.summary` | Present only when a summary is included. Value is `estimateTokens` of that summary text |
| `metrics.contextBreakdown.history` | Present only when at least one verbatim message is included. Estimate uses only those message texts |
| `metrics.promptTokens` | Existing completeness rule, extended to include every summary-model call made for the turn |
| `metrics.calls`, `metrics.latencyMs` | Unchanged strategy metrics |

## Relationships

- A conversation has zero or one current summary.
- A summary covers a prefix of that conversation's messages, through
  `covered_through_message_id`.
- Summaries are never read or written for a different conversation.
- Message retention and conversation deletion stay on the existing lifecycle.
  Deleting a conversation removes its summary through the foreign key.

## Validation

- Summary content is not blank after trimming and is at most 200 estimated
  tokens.
- The coverage id is a message id in the same conversation and is the newest
  id of the batch just merged.
- Store failures and unacceptable summary text become domain errors. The
  response does not include the rejected text or internal storage details.
