# Feature Specification: Persistent Conversations

**Feature Branch**: `[unbranched]`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User description: "Conversa persistente: ConversationStore (append/lastMessages/create) + tabela messages como no SqliteOpsStore. /chat: conversationId opcional, devolvido na resposta. 12 ultimas mensagens no prompt via composicão, metrica historyMessages. testes ':memory' + fake. HISTORY_MESSAGES_THRESHOLD opcional, default 12; executar estratégia com { message, history }."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start or continue a conversation (Priority: P1)

An operator can send a chat message either as a new conversation or as part of
an existing conversation. The response identifies the conversation so the
operator can continue it in a later request.

**Why this priority**: Without a stable conversation identity, the system cannot
reliably connect messages across requests.

**Independent Test**: Submit a chat request without a conversation identifier,
then submit another request using the returned identifier. Verify both
responses identify the same conversation and the second request continues its
stored history.

**Acceptance Scenarios**:

1. **Given** a valid chat request without a conversation identifier, **When**
   the request completes, **Then** the response includes a newly created
   conversation identifier.
2. **Given** a valid chat request with an existing conversation identifier,
   **When** the request completes, **Then** the response includes that same
   identifier and the conversation continues.
3. **Given** a chat request with an unknown conversation identifier, **When**
   the request is processed, **Then** the system reports that the conversation
   does not exist and does not silently start a different conversation.

### User Story 2 - Continue with relevant conversation history (Priority: P1)

An operator can ask follow-up questions and have the system consider recent
messages from the same conversation, without including an unbounded history.

**Why this priority**: Recent context lets operators build on prior incident
details while keeping each request's context bounded and predictable.

**Independent Test**: Seed a conversation with more messages than the
configured history threshold and submit a follow-up. Verify that only the most
recent messages up to the threshold are composed into the strategy input, in
chronological order.

**Acceptance Scenarios**:

1. **Given** a conversation with more prior messages than the configured
   threshold, **When** another chat request uses that conversation, **Then**
   only its most recent prior messages up to the threshold are included in the
   strategy input, ordered from oldest to newest.
2. **Given** a conversation with fewer messages than the configured threshold,
   **When** another chat request uses that conversation, **Then** all
   available prior messages are included in their original order.
3. **Given** a conversation with no prior messages, **When** its first chat
   request is processed, **Then** no prior history is included.

### User Story 3 - Verify how much history was used (Priority: P2)

An operator or support engineer can inspect the chat metrics and determine how
many prior messages informed an answer.

**Why this priority**: A count makes history use observable and helps explain
whether a follow-up had enough conversation context.

**Independent Test**: Submit requests against conversations with zero, fewer
than the threshold, and more prior messages than the threshold. Compare
`historyMessages` with the number of prior messages actually included in each
strategy input.

**Acceptance Scenarios**:

1. **Given** a request with no prior history, **When** it completes, **Then**
   `historyMessages` is zero.
2. **Given** a request with prior history, **When** it completes, **Then**
   `historyMessages` equals the number of prior messages included in its
   strategy input and never exceeds the configured threshold.

### Edge Cases

- A new conversation starts with zero historical messages and its first
  response includes its generated identifier.
- If fewer prior messages exist than the configured threshold, all are used;
  otherwise only the newest messages up to that threshold are used, preserving
  chronological order among those selected.
- A supplied but unknown conversation identifier is reported as not found
  rather than being replaced with a new conversation.
- Persistence failures must be surfaced as errors and must not be reported as a
  successful chat response.
- A failure while generating an answer must not create a success-shaped
  response or an assistant message that represents an answer that was not
  produced.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow a chat request to include an optional
  `conversationId`.
- **FR-002**: When `conversationId` is omitted, the system MUST create a new
  conversation and include its identifier in the successful response.
- **FR-003**: When `conversationId` identifies an existing conversation, the
  system MUST continue that conversation and return the same identifier in the
  response.
- **FR-004**: When a supplied `conversationId` does not identify an existing
  conversation, the system MUST report a not-found error and MUST NOT silently
  create a replacement conversation.
- **FR-005**: For each successful exchange, the system MUST persist the user's
  message and the assistant's completed response in order so they remain
  available to subsequent requests for that conversation.
- **FR-006**: Before composing a response, the system MUST include up to the
  `HISTORY_MESSAGES_THRESHOLD` most recent prior messages from the selected
  conversation in the strategy input, ordered from oldest to newest, together
  with the current message and its role.
- **FR-007**: A successful chat response MUST include `historyMessages`, equal
  to the number of prior conversation messages actually included in the
  strategy input; its value MUST be between zero and the configured history
  threshold inclusive.
- **FR-008**: Conversation persistence MUST support creating a conversation,
  appending messages, and retrieving enough recent conversation messages for
  the configured history context through the requested `ConversationStore`
  capabilities (`create`, `append`, and `lastMessages`).
- **FR-009**: Persisted messages MUST be represented in a `messages` table
  following the existing `SqliteOpsStore` persistence conventions.
- **FR-010**: Tests MUST verify persistence using an in-memory SQLite database
  (`:memory:`) and verify chat composition with a fake conversation store,
  without requiring a live model provider or network service.
- **FR-011**: Failures in conversation lookup, message persistence, or answer
  generation MUST be surfaced as errors and MUST NOT be returned as successful
  chat results.
- **FR-012**: The history threshold MUST be configurable through the
  `HISTORY_MESSAGES_THRESHOLD` environment variable and MUST default to 12 when
  the variable is absent. A configured value MUST be a positive safe integer;
  invalid values MUST be reported explicitly rather than silently defaulted.

### Key Entities

- **Conversation**: A distinct chat history identified by a stable identifier.
- **Message**: A user request or assistant response belonging to a conversation
  and ordered relative to that conversation's other messages.
- **Conversation History**: The most recent prior messages available to inform
  a chat request, capped at the configured threshold (12 by default).
- **History Metric**: The `historyMessages` count of prior conversation messages
  included in a request's prompt.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of successful requests without a conversation identifier
  return a new identifier, and 100% of successful requests with an existing
  identifier return that same identifier.
- **SC-002**: In all tested conversation lengths and valid configured
  thresholds, the strategy receives no more prior messages than the threshold
  and receives the most recent available messages in chronological order.
- **SC-003**: In all tested conversation lengths, `historyMessages` equals the
  number of prior messages included in the strategy input and remains between
  zero and the configured threshold.
- **SC-004**: 100% of verified history boundary cases cover empty, partial, and
  over-limit histories and confirm the correct messages and count.

## Assumptions

- Existing chat response fields and behavior remain unchanged; this feature
  adds `conversationId` and the `historyMessages` metric.
- Only messages from the identified conversation are eligible to be included
  as history.
- The default history threshold is 12 prior messages;
  `HISTORY_MESSAGES_THRESHOLD` may set a different positive safe integer.
- The requested `lastMessages` capability supplies recent history for prompt
  composition; the strategy receives a structured input containing the current
  message and the ordered history.
- A missing conversation is an error (HTTP 404); it does not implicitly create
  a new conversation when an identifier was supplied.
- Message retention and conversation deletion are outside this feature's
  scope; history remains available according to the existing application's
  persistence lifecycle.
- The requested store operations, `messages` table, in-memory database test,
  and fake-store test are explicit constraints from the feature brief; no
  additional implementation stack choices are introduced by this
  specification.
