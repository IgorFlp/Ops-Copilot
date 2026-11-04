# Persistent Conversations Quickstart

This guide validates conversation persistence and history-aware chat
composition using in-memory SQLite and deterministic test doubles. Tests do not
require model credentials, a file-backed database, or external network access.

## Prerequisites

- Node.js 22 LTS and the repository dependencies.
- No `.env` values, provider credentials, or external service are needed for
  the focused tests.

## Validation commands

Run the focused persistence and chat tests after implementation:

```powershell
node --import tsx --test src/store/sqlite-conversation-store.test.ts src/services/chat-service.test.ts src/controllers/chat-controller.test.ts
```

Run type checking:

```powershell
npm run typecheck
```

Run the complete test suite:

```powershell
npm test
```

## Expected scenarios

1. The SQLite store creates a conversation, appends user and assistant
   messages, retrieves them in the expected order, and keeps separate
   conversations isolated within a `:memory:` database.
2. A request without `conversationId` creates a conversation and returns its
   identifier.
3. A request with an existing identifier composes available prior messages in
   chronological order, runs the deterministic fake strategy, persists the
   successful answer, and returns the same identifier.
4. With no configured threshold, more than 12 prior messages yield the newest
   12 in strategy history; fewer yield all available prior messages. When
   `HISTORY_MESSAGES_THRESHOLD` is set to a valid positive integer, history is
   bounded by that value.
5. A supplied unknown identifier maps to 404 and does not create a replacement
   conversation.
6. Invalid `conversationId` input is rejected before store or strategy calls;
   persistence or strategy failures do not return a successful response.
7. An explicitly invalid `HISTORY_MESSAGES_THRESHOLD` is reported as a
   configuration error rather than silently replaced by the default.

The HTTP request and response schemas are defined in
[contracts/chat-api.yaml](./contracts/chat-api.yaml); persistent entities and
history ordering are described in [data-model.md](./data-model.md).
