# Feature Specification: Learning Reflector

**Feature Branch**: `[009-learning-reflector]`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User description: "After each response, a learning reflector evaluates the latest user message and distills durable facts (never one-off requests or secrets) into the user's existing memories asynchronously; provide a `forget_preference` tool."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Remember durable facts automatically (Priority: P1)

An operator shares a stable preference or other useful, lasting fact during a
conversation. After the assistant has answered, the fact is saved to that
operator's memory so future conversations can benefit from it without the
operator repeating it.

**Why this priority**: Automatic learning delivers the central benefit of the
feature while keeping memory scoped to the existing owner.

**Independent Test**: Send a message that clearly states a lasting preference,
receive the response, and verify that the preference is eventually available
only in that user's memory.

**Acceptance Scenarios**:

1. **Given** a user states a durable, non-secret preference in their latest
   message, **When** the assistant responds, **Then** the preference is saved
   to that user's memory after the response is delivered.
2. **Given** a durable fact has been learned, **When** the same user starts a
   later conversation, **Then** the existing memory feature can recall that
   fact without requiring the user to repeat it.
3. **Given** the same fact is already remembered, **When** the reflector
   learns it again, **Then** existing duplicate-prevention behavior avoids
   creating a duplicate.

### User Story 2 - Keep transient requests and secrets out of memory (Priority: P1)

An operator can give one-time instructions or include sensitive credentials
without having those details saved as durable memories.

**Why this priority**: Incorrectly retaining ephemeral instructions or secrets
would reduce trust and could expose sensitive information in future
conversations.

**Independent Test**: Submit examples of one-time requests and common secret
formats, then verify none are added to memory.

**Acceptance Scenarios**:

1. **Given** the latest message contains only a one-time request or
   task-specific instruction, **When** the assistant responds, **Then** no
   durable memory is created from that request.
2. **Given** the latest message contains a password, token, private key, or
   comparable credential, **When** the assistant responds, **Then** the secret
   is not stored as a memory.
3. **Given** a message contains both a durable fact and a secret, **When** the
   assistant responds, **Then** the secret is excluded and only a separable,
   non-secret durable fact may be remembered.
4. **Given** a message does not contain a clear durable, non-secret fact,
   **When** it is evaluated, **Then** no memory is saved.

### User Story 3 - Forget a learned preference (Priority: P2)

An operator can ask the assistant to forget a previously learned preference,
and the assistant removes only the matching preference from that operator's
memory.

**Why this priority**: Users need a direct way to correct or withdraw
information that was learned automatically.

**Independent Test**: Learn two preferences for one user, request removal of
one using the `forget_preference` action, and verify that only the requested
preference is removed.

**Acceptance Scenarios**:

1. **Given** a user has a learned preference, **When** they ask the assistant
   to forget it, **Then** the `forget_preference` action removes that
   preference from their memory.
2. **Given** the requested preference is absent or ambiguous, **When** the
   user asks to forget it, **Then** no unrelated memory is removed and the
   assistant does not claim that removal succeeded.
3. **Given** two users have learned preferences, **When** one user requests a
   preference removal, **Then** only that user's memory can be changed.

### Edge Cases

- The latest user message includes multiple facts, some durable and some
  transient; only independently understandable, durable, non-secret facts may
  be remembered.
- A fact is already present or semantically similar to an existing memory;
  existing duplicate-prevention behavior applies.
- The reflector cannot determine whether a statement is durable or
  non-secret; it saves nothing rather than guessing.
- Memory persistence fails after the response has already been delivered; the
  response remains available, but the system does not report that learning
  succeeded.
- The user requests forgetting a preference that cannot be uniquely matched;
  the system asks for clarification or leaves memory unchanged.
- The latest message contains only a correction to an existing fact; the
  reflector replaces the previous fact only when the correction and exactly
  one existing memory can be matched unambiguously; otherwise it leaves
  memories unchanged and asks the user to clarify.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: After each assistant response, the system MUST evaluate the
  latest user message for facts that are durable and useful in future
  conversations.
- **FR-002**: The system MUST consider only the latest user message when
  identifying candidate facts and MUST NOT treat an assistant statement or
  earlier conversation content alone as a new user fact.
- **FR-003**: The system MUST save a candidate only when it is clearly a
  durable, non-secret fact; otherwise it MUST save nothing.
- **FR-004**: The system MUST NOT save one-time requests, task-specific
  instructions, passwords, authentication tokens, private keys, or comparable
  secrets.
- **FR-005**: The system MUST associate each learned fact with the same user
  identity that owns the current conversation and MUST NOT expose it to or
  store it for another user.
- **FR-006**: Learning MUST occur asynchronously so that evaluation or memory
  persistence does not delay delivery of the assistant's response.
- **FR-007**: The system MUST save eligible facts through the existing
  user-scoped memory capability and MUST retain its duplicate-prevention
  behavior.
- **FR-008**: The system MUST provide a `forget_preference` action that removes
  only the requesting user's matching learned preference.
- **FR-009**: If a forget request is ambiguous or has no matching preference,
  the system MUST leave unrelated memories unchanged and MUST NOT claim
  successful removal.
- **FR-010**: If learning or forgetting fails, the system MUST NOT report the
  operation as successful; a learning failure MUST NOT retract or delay the
  response already delivered.
- **FR-011**: If a message contains a durable fact alongside a secret, the
  system MAY save the durable fact only when it can be separated without
  retaining or reconstructing the secret.
- **FR-012**: When a user corrects a previously learned fact, the system MUST
  replace the obsolete fact only when the correction and exactly one existing
  memory can be matched unambiguously; otherwise it MUST leave memories
  unchanged and ask the user to clarify before running the normal chat strategy.
  A uniquely matched replacement is committed only after the assistant
  response is successfully persisted.

### Key Entities

- **Candidate Learning**: A proposed durable fact extracted from the latest
  user message, including whether it qualifies for memory.
- **Learned Memory**: A non-secret, durable fact associated with its owning
  user and available to the existing memory and recall experience.
- **Forget Preference Request**: A user's request to remove one matching
  learned preference from their own memory.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In all defined durable-fact acceptance tests, eligible facts
  become available in the correct user's memory after the response is
  delivered.
- **SC-002**: In the defined test set of one-time requests, credentials, and
  unclear statements, zero ineligible facts are added to memory.
- **SC-003**: Across success, slow-processing, and persistence-failure tests,
  the assistant's response is delivered without waiting for learning to
  complete.
- **SC-004**: In all preference-forgetting tests, only the requested,
  unambiguously matched preference belonging to the requesting user is
  removed.
- **SC-005**: Repeated learning of an existing fact does not increase the
  number of duplicate memories.

## Assumptions

- A durable fact is a stable preference, role, or lasting piece of user
  context that is likely to improve future conversations; a direction limited
  to the current task is not durable.
- The system prefers not to remember an uncertain candidate rather than
  infer a durable fact or risk retaining a secret.
- The existing conversation user identity is the sole source of memory
  ownership for both learning and forgetting.
- Existing user-scoped memory storage, recall, and duplicate handling remain
  the source of truth; this feature adds automatic learning and a dedicated
  preference-forgetting action rather than replacing those capabilities.
- Automatically replacing a corrected fact is permitted only when the user
  explicitly corrects it and exactly one existing memory is identified;
  uncertain or multiple matches are not changed.
- Learning and forgetting are best-effort actions that do not alter an
  already delivered assistant response; failures are surfaced through the
  system's established operational error handling.
