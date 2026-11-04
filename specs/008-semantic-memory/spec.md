# Feature Specification: Semantic Memory

**Feature Branch**: `[unbranched]`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User description: "User-scoped semantic memory for an operational assistant: remember facts with duplicate detection, retrieve the most relevant facts, forget a specific fact, and use relevant memories to inform responses."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Remember and manage personal facts (Priority: P1)

An operator can explicitly save a fact for later use, avoid accumulating
near-duplicate facts, and remove a selected fact when it is no longer useful.
Facts saved for one user remain private to that user's memory.

**Why this priority**: The system needs reliable, user-scoped facts before it
can provide useful long-term context.

**Independent Test**: Save a fact for one user, attempt to save a near-duplicate,
and verify only one copy remains. Remove that fact and verify it is no longer
available while another user's facts remain unchanged.

**Acceptance Scenarios**:

1. **Given** a fact has not been saved for a user, **When** the user remembers
   it, **Then** it is stored and can later be found for that same user.
2. **Given** a saved fact and a new fact have similarity greater than `0.92`,
   **When** the new fact is remembered, **Then** a duplicate is not added and
   the existing fact is preserved.
3. **Given** a user selects one of their saved facts to forget, **When** the
   request completes, **Then** that fact is removed and the user's other facts
   remain available.
4. **Given** two users have memories, **When** either user views or manages
   memories, **Then** no fact belonging to the other user is returned, changed,
   or removed.
5. **Given** a memory operation cannot be completed, **When** the user attempts
   to save or manage a fact, **Then** the system reports the failure and does
   not report that the operation succeeded.

### User Story 2 - Recall relevant facts during chat (Priority: P1)

An operator can ask a question using different wording from a previously saved
fact and receive a response informed by that relevant fact, without repeating
the fact in the current request.

**Why this priority**: Semantic recall lets operators build on durable context
and is the primary user benefit of this feature.

**Independent Test**: Save a fact using one set of words, then send a chat
question that expresses the same intent without sharing words with the fact.
Verify that the fact is included in the context used to produce the answer.

**Acceptance Scenarios**:

1. **Given** a user has saved a fact relevant to a chat question, **When** the
   user sends the question with their user identifier, **Then** relevant facts
   for that user are considered and included in the response context.
2. **Given** a relevant saved fact and a chat question use different words,
   **When** the question is processed, **Then** the fact can still be recalled
   based on meaning.
3. **Given** more than three facts are relevant, **When** the user chats,
   **Then** only the three most relevant facts are included in relevance order.
4. **Given** no fact meets the minimum relevance threshold, **When** the user
   chats, **Then** no unrelated memory is included.
5. **Given** a chat request has no user identifier, **When** it is validated,
   **Then** the request is rejected rather than accessing unscoped memories.

### User Story 3 - Keep memory operations isolated by user (Priority: P1)

Each user can rely on saved facts remaining within their own memory, including
when another user has saved an identical or highly relevant fact.

**Why this priority**: User isolation is necessary for trust and privacy.

**Independent Test**: Save facts for two users, issue matching recall and
forget operations for each, and verify every result and change is limited to
the requesting user's facts.

**Acceptance Scenarios**:

1. **Given** two users have the same or semantically similar facts, **When**
   one user recalls facts, **Then** only that user's facts are returned.
2. **Given** a fact identifier belongs to another user, **When** a user
   attempts to forget it, **Then** the other user's fact remains unchanged.

### Edge Cases

- A fact at or below the `0.92` duplicate threshold is not treated as a
  duplicate; the duplicate rule applies only when similarity is greater than
  `0.92`.
- A recall result at exactly `0.3` does not meet the strict minimum threshold;
  results at or below `0.3` are excluded.
- When multiple facts have the same relevance, the returned set remains
  bounded to three facts.
- A user with no saved facts, or a question with no qualifying facts, receives
  no memory context.
- Forgetting a fact that does not exist for the requesting user reports that
  it was not found and does not change any other user's memory.
- If memory cannot be read or updated, the failure is reported explicitly and
  is not represented as a successful memory operation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a memory capability that allows facts to
  be remembered, recalled, and forgotten for a specific user.
- **FR-002**: The system MUST associate each saved fact with its owning user
  and MUST restrict every remember, recall, and forget operation to that user.
- **FR-003**: The system MUST avoid adding a new fact as a duplicate when its
  similarity to an existing fact for the same user is greater than `0.92`.
- **FR-004**: A duplicate remember operation MUST preserve the existing fact
  and MUST NOT create an additional copy.
- **FR-005**: Recall MUST rank qualifying facts by semantic relevance, return
  no more than three facts, and exclude facts with a relevance score at or
  below `0.3`.
- **FR-006**: Recall MUST support finding a relevant fact when the query and
  saved fact express the same meaning without sharing words.
- **FR-007**: A chat request MUST include a user identifier. Before generating
  a response, the system MUST recall qualifying facts for that user and make
  them available as context to the response.
- **FR-008**: A chat request MUST NOT include facts belonging to another user,
  even when those facts are more relevant to the query.
- **FR-009**: The system MUST allow a user to forget one selected fact that
  belongs to them without removing any other fact.
- **FR-010**: An attempt to forget a fact that does not belong to the
  requesting user MUST NOT remove or disclose that fact.
- **FR-011**: Memory facts MUST remain available across separate requests
  until the owner forgets them.
- **FR-012**: Memory operation failures MUST be reported explicitly and MUST
  NOT be presented as successful memory operations.

### Key Entities

- **User**: The owner whose identifier defines the boundary for all memory
  operations.
- **Memory**: A fact saved by a user, with an identifier and creation time,
  and available for later relevance-based recall or targeted removal.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In all user-isolation acceptance tests, recall and forget return
  or affect only facts owned by the requesting user.
- **SC-002**: A saved fact is successfully returned in the defined
  cross-vocabulary semantic-recall test when its meaning matches the query and
  it meets the minimum relevance threshold.
- **SC-003**: Every recall result contains at most three facts, and every
  returned fact has a relevance score strictly greater than `0.3`.
- **SC-004**: Duplicate-detection tests reject a second fact when similarity is
  greater than `0.92` and preserve both facts when similarity is at or below
  that boundary.
- **SC-005**: With up to 1,000 saved facts for a user, 95% of recall requests
  complete in under one second in the defined acceptance-test environment.
- **SC-006**: An operator can complete the remember, recall-through-chat, and
  targeted-forget journeys without repeating saved facts in each chat request.

## Assumptions

- Facts are saved through an explicit remember operation; the system does not
  infer and save facts automatically from every chat.
- The user identifier is supplied by the caller and is mandatory for chat
  requests that use memory; identity authentication and authorization beyond
  user-scoped memory are handled by the surrounding application.
- A duplicate save does not replace the original fact.
- A user selects a specific fact by its memory identifier when asking to
  forget it.
- Facts are retained until explicitly forgotten; automatic expiration is out
  of scope.
- The initial performance target is measured for up to 1,000 facts per user in
  a controlled acceptance-test environment.
