# Research: Persistent Conversations

## Decisions

### SQLite persistence and runtime composition

- **Decision**: Implement a `ConversationStore` boundary and a
  `SqliteConversationStore` adapter using Node.js `DatabaseSync`. Use the
  configured `OPSPILOT_DB` path, create the feature tables idempotently, use
  prepared statements with bound parameters, and expose explicit close
  lifecycle handling for the runtime.
- **Rationale**: This follows the project constitution and the established
  `SqliteOpsStore` and `openDatabase` conventions while keeping chat
  persistence independent from operational records.
- **Alternatives considered**: Add a third-party SQLite package (unnecessary
  under the mandated runtime); write directly from the chat service (breaks
  MVC and makes tests less isolated); store conversations in operational
  incident tables (different domain and lifecycle).
- **Evidence**: The repository's `src/models/database.ts` centralizes SQLite
  path resolution and connection setup; `src/store/sqlite-ops-store.ts` uses
  idempotent DDL, prepared statements, bound inputs, and explicit close.

### Conversation identity and ownership

- **Decision**: `create()` persists a conversation with a stable opaque
  identifier. A supplied identifier must resolve to an existing conversation;
  otherwise the service raises a not-found domain error. No user/account owner
  is modeled in this feature.
- **Rationale**: The API needs to distinguish creating a new conversation
  from resuming one and must not silently switch histories.
- **Alternatives considered**: Create a replacement when an identifier is
  unknown (masks client errors and can split history); attach ownership to
  users (authentication and account scope are outside the feature).

### Message table and ordering

- **Decision**: Store conversations and messages separately. Each message has
  a conversation identifier, role, content, and insertion order/time. Store
  operations include `create`, `append`, and the requested `lastMessages`
  operation; define `lastMessages(conversationId, limit)` to return up to
  `limit` most recent messages, newest-first at the persistence boundary, then
  reverse the selected slice before prompt composition.
- **Rationale**: A conversation record permits existence checks even before
  its first message; a separate `messages` table directly meets the feature
  brief. Bounded descending retrieval is efficient and reversing gives the
  strategy chronological context. The return set is plural because the
  required prompt can contain multiple messages, while preserving the
  user-requested operation name and matching the implementation example.
- **Alternatives considered**: Store messages as a JSON transcript on a
  conversation row (makes append and bounded retrieval less direct); return
  only one row from `lastMessages` (cannot satisfy the multi-message history
  requirement).

### Configurable history threshold

- **Decision**: Read `HISTORY_MESSAGES_THRESHOLD` as a positive safe integer
  and default to 12 when unset. Reject an explicitly invalid value with a
  configuration error.
- **Rationale**: This preserves the example's configurable window while
  preventing malformed runtime configuration from silently changing behavior.
- **Alternatives considered**: Hard-code 12 (ignores the supplied example);
  silently fall back to 12 for invalid values (masks deployment mistakes).

### Turn persistence and prompt composition

- **Decision**: Load history before appending the current user message, then
  append that user message before strategy execution and append the assistant
  message only after a successful result. Fetch at most the configured number
  of prior messages, order the selected messages oldest-to-newest, and compose
  their roles and contents with the current request into a structured strategy
  input: `{ message, history }`. Set `metrics.historyMessages` to the count of
  prior messages in that input.
- **Rationale**: Persisting each accepted request preserves the operator's
  conversation even if generation later fails; only completed answers are
  stored as assistant messages. Chronological role-labeled history preserves
  turn meaning and makes the metric directly auditable.
- **Alternatives considered**: Include the current message in the history
  cap (would reduce prior context); report the number of messages fetched
  rather than used (can misstate actual prompt context); store a failed
  generation as an assistant answer (misrepresents a result).
- **Compatibility note**: Existing strategies accept string input. They will
  normalize the structured input into role-labeled text internally, while
  retaining existing string callers used by the arena and benchmark.

### HTTP contract and errors

- **Decision**: Accept `conversationId` as an optional request field and add it
  at the top level of the successful result. Add `historyMessages` to the
  existing `metrics` object. Map an unknown conversation to HTTP 404 through
  the existing `DomainError` handler; retain existing behavior for validation,
  unsupported strategies, timeouts, and execution failures.
- **Rationale**: This extends the existing `/chat` shape while keeping
  conversation identity distinct from strategy metrics and using the
  application's established domain-error boundary.
- **Alternatives considered**: Nest `conversationId` inside metrics (mixes
  identity with telemetry); silently create a conversation for an unknown
  supplied identifier (hides request mistakes); return history messages to
  the client (not required and exposes internal context).

### Testing

- **Decision**: Verify schema, append order, conversation lookup, configured
  bounded retrieval using `SqliteConversationStore(":memory:")`; verify history
  composition, response ID/metric, missing identifiers, and failure behavior
  with a fake store and deterministic strategy.
- **Rationale**: This covers the persistence adapter and the service/API seam
  without file-backed state, model credentials, or external network access.
- **Alternatives considered**: Test only SQL methods (misses HTTP composition
  and response contract); use a live provider (nondeterministic and unnecessary
  for contract tests); use only a fake store (does not verify SQLite schema and
  persistence semantics).
