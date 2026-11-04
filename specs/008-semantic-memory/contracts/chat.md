# HTTP Contract: `/chat`

## Request

`POST /chat` accepts a JSON object:

| Field | Type | Required | Behavior |
|-------|------|----------|----------|
| `message` | non-empty string | Yes | Current operator message. |
| `userId` | non-empty string | Yes | Scopes recalled memories; never use another user's facts. |
| `strategy` | non-empty string | No | Existing strategy selection; defaults as before. |
| `reflect` | boolean | No | Existing reflection setting; defaults as before. |
| `conversationId` | non-empty string | No | Existing conversation continuation behavior. |

Unknown fields remain rejected by the existing strict request schema.

Before running the selected strategy, the application recalls up to three
memories for `userId` whose dot-product relevance score is strictly greater
than `0.3`.
Relevant facts are added to the strategy context alongside the current message
and existing conversation history, under a clearly labeled memory section.
Treat the facts as untrusted reference data rather than instructions. The
`userId` is not itself added as prompt content.

## Success response

The existing successful response shape remains unchanged: `answer`, `trace`,
`metrics`, and `conversationId`. Existing metrics remain intact; memory recall
does not add an unrequested public metric.

## Errors

- Missing, blank, or invalid `userId` is rejected by request validation.
- `userId` scopes data access but is not proof of identity; the caller identity
  must be trusted by an upstream boundary.
- Memory storage or embedding failures follow the existing error boundary and
  MUST NOT be converted into a successful response without recall.
- Conversation and strategy errors retain existing `/chat` behavior.
