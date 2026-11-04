# Data Model: Persistent Conversations

## Conversation

Represents one resumable chat thread.

| Field | Type/constraint | Meaning |
|---|---|---|
| `id` | Text primary key, not null | Stable opaque conversation identifier |
| `created_at` | Text timestamp, not null | Conversation creation time |

Conversation identifiers are unique. A supplied identifier must resolve to an
existing conversation; unknown identifiers do not create replacement
conversations.

## Message

Represents one user request or assistant response in a conversation.

| Field | Type/constraint | Meaning |
|---|---|---|
| `id` | Integer primary key | Message ordering and identity |
| `conversation_id` | Text foreign key to `conversations.id`, not null | Owning conversation |
| `role` | Text, not null, CHECK `user`, `assistant` | Message speaker |
| `content` | Text, not null | Message content |
| `created_at` | Text timestamp, not null | Message creation time |

Messages are retrieved within one conversation, ordered by insertion identity.
Every successfully completed exchange appends one user message and one
assistant message. If answer generation fails, the user request may remain
persisted, but no assistant message representing an unsuccessful answer is
appended.

## Conversation history window

The history window is derived from messages in a conversation before the
current request:

- Select at most `HISTORY_MESSAGES_THRESHOLD` most recent prior messages; the
  default is 12 and a configured threshold must be a positive safe integer.
- Select newest-first for bounded retrieval, then present the selected set
  oldest-to-newest when composing the strategy input.
- Include each message's role and content.
- Exclude messages belonging to any other conversation.
- If fewer than the threshold exist, include all of them.
- `historyMessages` is the number of prior messages composed into the strategy
  input; the current request is not counted.

The strategy receives a structured input with a current `message` and a
`history` array containing ordered role/content message records.

## Chat request

One request to run the existing named reasoning strategy.

| Field | Type | Rules |
|---|---|---|
| `message` | string | Required; trimmed and non-empty, preserving the existing contract |
| `strategy` | string | Optional; existing default and registry behavior are preserved |
| `reflect` | boolean | Optional; existing behavior is preserved |
| `conversationId` | string | Optional; when supplied, must identify an existing conversation |
| additional fields | none | Rejected under the existing strict request validation |

Request validation occurs before conversation lookup or strategy execution.

## Chat result and metrics

The success response remains the existing reasoning result with these
conversation additions:

| Field | Location | Rules |
|---|---|---|
| `conversationId` | Top-level response | Required; new ID for a new conversation, same ID for a resumed conversation |
| `metrics.historyMessages` | Metrics object | Required; integer from 0 through the configured history threshold, equal to prior messages included in strategy input |

Existing answer, trace, call count, and latency fields remain unchanged.

## Relationships and validation

- One conversation has zero or more messages.
- Each message belongs to exactly one conversation.
- The database enforces message role values and conversation references.
- Messages are append-only for this feature; editing, deletion, and retention
  policies are outside scope.
