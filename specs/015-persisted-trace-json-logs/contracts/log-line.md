# Log Line Contract: Structured Operational Events

**Implementation**: `src/obs/logger.ts` (`logEvent`)

**Destination**: process stderr, matching the existing logging destination

## Format

Exactly one JSON object per line, terminated by a single newline:

```json
{"timestamp":"2026-11-10T12:00:00.000Z","event":"chat.start","requestId":"6f1a2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d","conversationId":"9b2f...","userId":"operator-1","strategy":"react","reflect":false,"messageChars":25}
```

- Each event produces one line; serialized values must not contain raw newlines.
- Output must parse with `JSON.parse` for every line.
- Fields with `undefined` values are omitted.
- `Error` values are reduced to `{ name, message, code? }` through `errorDetail`.
- Unserializable values are replaced with a stable marker rather than breaking the line.

## Required Fields

| Field | Type | Rules |
|-------|------|-------|
| `timestamp` | string | ISO-8601 timestamp generated at emission |
| `event` | string | Non-empty event name, e.g. `chat.start`, `chat.completed`, `chat.failure`, `memory.recalled` |

## Optional Correlation Fields

| Field | Type | Rules |
|-------|------|-------|
| `requestId` | string | Present when the event belongs to a chat request |
| `conversationId` | string | Present when known |
| `userId` | string | Present when known |
| `strategy` | string | Present when known |
| `node` | string | Present when known |

## Allowed Metadata

Identifiers, counts, durations, token counts, character counts, strategy names, node names, event types, statuses, booleans, and error metadata (`name`, `message`, `code`).

## Forbidden Content

The following must never appear in log output:

- User message text or answer text
- Prompt or completion text
- Tool arguments or tool result content
- Memory facts or recalled content
- Conversation summaries
- API keys, tokens, passwords, or any secret value

Content-bearing keys are stripped or replaced by the logger. Persisted trace payloads may contain content; log lines may not.

## Examples

Start:

```json
{"timestamp":"2026-11-10T12:00:00.000Z","event":"chat.start","requestId":"6f1a...","conversationId":"9b2f...","userId":"operator-1","strategy":"react","reflect":false,"messageChars":25}
```

Completion:

```json
{"timestamp":"2026-11-10T12:00:01.000Z","event":"chat.completed","requestId":"6f1a...","conversationId":"9b2f...","strategy":"react","durationMs":850,"calls":2,"historyMessages":0,"truncated":[]}
```

Failure:

```json
{"timestamp":"2026-11-10T12:00:01.000Z","event":"chat.failure","requestId":"6f1a...","userId":"operator-1","error":{"name":"DomainError","message":"Chat execution failed","code":"INTERNAL"}}
```

Persistence failure:

```json
{"timestamp":"2026-11-10T12:00:01.000Z","event":"request.persist_failure","requestId":"6f1a...","error":{"name":"Error","message":"database is locked"}}
```
