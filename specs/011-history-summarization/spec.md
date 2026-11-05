# Feature Specification: History Summarization

**Feature Branch**: `011-history-summarization`

**Created**: 2026-11-05

**Status**: Draft

**Input**: User description: "Sumarização de historico (pruning): tabela conversation_summaries, o que sai das 8 mensagens recentes vira um resumo de aproximadamente 150 tokens preservando decisões, fatos e pendencias, MESCLADO ao resumo anterior e persistido, refeito só quanto 8 novas mensagens saem da janela, nunca a cada request. Resumo entra no contexto, evento summarize com teste fake"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Keep a long conversation usable (Priority: P1)

An operator can continue a long incident conversation and still have the
assistant use what was decided, what is known, and what remains open, without
copying the whole history into every answer.

**Why this priority**: Unbounded history makes later answers expensive and
easy to drown in old detail. A short running summary is what keeps early
decisions available after they leave the recent window.

**Independent Test**: Build a conversation long enough that at least eight
messages have fallen outside the eight most recent messages. Ask a follow-up
that depends on a decision, a fact, and an open item from those older
messages. Verify the answer context contains the eight most recent messages
word for word, contains one summary of about 150 tokens that still carries
those three kinds of information, and does not contain the older messages
verbatim.

**Acceptance Scenarios**:

1. **Given** a conversation whose prior messages all fit in the eight most
   recent, **When** the operator sends another message, **Then** those prior
   messages are available word for word and no summary is added.
2. **Given** at least eight prior messages have fallen outside the eight most
   recent and have been folded into a summary, **When** the operator sends
   another message, **Then** the answer context includes that summary and only
   the eight most recent prior messages verbatim.
3. **Given** the summarized portion recorded a decision, a fact, and an open
   item, **When** the summary is supplied with the next answer, **Then** all
   three are still present in the summary.
4. **Given** two conversations each have their own older history, **When**
   the operator continues one of them, **Then** only that conversation's
   summary is included.

---

### User Story 2 - Refresh the summary only after eight messages leave (Priority: P1)

An operator can keep chatting without the summary being rewritten on every
message. The saved summary changes only after eight further messages have left
the recent window, and the new text is merged into the summary already saved.

**Why this priority**: Rewriting the summary on every request would discard
the point of a stable running brief and would repeat work that the operator
did not ask for.

**Independent Test**: Save a summary that already covers an earlier group of
eight departed messages. Add seven more messages beyond the recent window and
verify the saved summary and its covered range stay unchanged. Add the eighth
and verify the saved summary is replaced by a merge of the previous summary
plus exactly those eight newly departed messages.

**Acceptance Scenarios**:

1. **Given** a saved summary and fewer than eight later messages have left the
   recent window since that summary, **When** the operator sends further
   messages, **Then** the saved summary is reused and is not rewritten.
2. **Given** eight messages have newly left the recent window, **When** the
   next answer is prepared, **Then** those eight messages are merged with the
   previous summary into one new summary of about 150 tokens and that result
   replaces the saved summary.
3. **Given** no summary exists yet and eight messages have left the recent
   window, **When** the next answer is prepared, **Then** the first summary is
   created from those eight messages and saved.
4. **Given** a new summary was saved, **When** a later request does not have
   another full group of eight departed messages, **Then** the later request
   uses the saved summary and does not create another one.

---

### User Story 3 - See when a summary was refreshed (Priority: P2)

An operator or reviewer can tell, from the turn itself, whether the running
summary was refreshed or simply reused.

**Why this priority**: The refresh is invisible in the answer text. A distinct
event makes the batching rule observable and testable without a live model.

**Independent Test**: Run one turn that completes a group of eight departed
messages using a stand-in summarizer, and another turn that only reuses the
saved summary. Verify a `summarize` event is present only for the turn that
writes a new summary, and that the stand-in is not contacted on the reuse
turn.

**Acceptance Scenarios**:

1. **Given** a turn writes a new merged summary, **When** the turn completes,
   **Then** its trace includes one `summarize` event whose content is that
   summary.
2. **Given** a turn reuses the saved summary, **When** the turn completes,
   **Then** its trace has no `summarize` event.
3. **Given** the summarizer is a stand-in with no live model, **When** the
   batch boundary and the reuse case are exercised, **Then** both the saved
   summary and the presence or absence of the event match the stand-in
   result.

### Edge Cases

- A conversation with eight or fewer prior messages has no departed messages,
  no saved summary, and no `summarize` event. All prior messages are included
  verbatim.
- When one to seven messages have left the recent window and are not yet
  covered by a summary, they are not copied verbatim and are not summarized
  yet. The previous summary, if any, stays as it was.
- The first summary has no earlier summary to merge with. It is built only
  from the eight departed messages.
- If several groups of eight departed messages are overdue at once, each group
  is merged oldest-first, one group per update, until fewer than eight
  uncovered departed messages remain. Each update is saved before the next
  and each emits its own `summarize` event. The answer context receives the
  final saved summary.
- A pending item that the newly summarized messages resolve is no longer
  listed as pending. A fact that those messages contradict is kept in its
  newer form. Decisions, facts, and pending items that remain valid are kept.
- An empty summary, or a summary longer than the accepted approximate length,
  is rejected. The previous summary stays unchanged.
- A failure while reading, merging, or saving the summary is reported as a
  failed turn. It does not produce a successful answer and does not replace
  the previous summary.
- The message being sent on the current turn is not counted as a departed
  message until it is part of the stored conversation. The eight-message
  window is evaluated from messages already stored.
- User and assistant messages both count toward the window and toward each
  group of eight.
- Messages already folded into the saved summary are not submitted again when
  a later group is merged. The merge input is the saved summary plus the new
  group of eight.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: For each chat turn, the system MUST include at most the eight
  most recent prior messages from that conversation as verbatim history,
  ordered from oldest to newest.
- **FR-002**: Prior messages older than those eight MUST NOT be included
  verbatim in the answer context.
- **FR-003**: The system MUST create or replace a conversation summary only
  when at least eight prior messages have left the recent window and are not
  yet covered by the saved summary. It MUST NOT create or replace a summary on
  a turn that does not have a full uncovered group of eight departed messages.
- **FR-004**: Each summary update MUST cover the oldest eight uncovered
  departed messages and no other messages. Messages already covered MUST NOT
  be sent again as raw messages.
- **FR-005**: When a saved summary already exists, the new summary MUST be a
  merge of that saved summary and the eight messages being covered. When none
  exists, the new summary MUST be produced from those eight messages alone.
- **FR-006**: The merged summary MUST preserve decisions, facts, and pending
  items that are still in force, MUST incorporate new decisions, facts, and
  pending items from the eight messages, MUST drop pending items the new
  messages resolve, and MUST represent a contradicted fact by its newer form.
- **FR-007**: Each saved summary MUST be a non-empty brief of approximately
  150 tokens. Using the product's existing estimate of one token per four
  characters, rounded down, an acceptable summary is from 1 to 200 tokens.
  A result outside that range MUST NOT be saved.
- **FR-008**: The system MUST persist the current summary for the conversation
  in `conversation_summaries`, including the summary text and how far the
  conversation has been covered. A later accepted merge MUST replace that
  conversation's current summary rather than append a second current summary.
- **FR-009**: When a saved summary exists, the answer context MUST include it
  together with the verbatim recent messages. The summary MUST be identifiable
  separately from those messages.
- **FR-010**: A turn that saves a new summary MUST add a trace event of type
  `summarize` whose content is that summary. A turn that does not save a new
  summary MUST NOT add a `summarize` event. When several overdue groups are
  processed in one turn, each saved update MUST add its own event, in order.
- **FR-011**: Summary text from one conversation MUST NOT be saved to or
  included in another conversation.
- **FR-012**: If producing or saving a required summary fails, or the produced
  text is empty or longer than 200 estimated tokens, the system MUST report
  the turn as failed, MUST leave the previously saved summary and coverage
  unchanged, and MUST NOT return a successful answer.
- **FR-013**: Tests MUST cover the eight-message window, the eight-message
  refresh boundary, merge with the previous summary, persistence in
  `conversation_summaries`, inclusion of the summary in the answer context,
  and the presence or absence of the `summarize` event, using a stand-in
  summarizer and without a live model provider.
- **FR-014**: The count of verbatim prior messages reported for a turn MUST
  equal the number of prior messages actually included verbatim and MUST NOT
  exceed eight. The summary MUST NOT be counted as one of those messages.

### Key Entities

- **Conversation summary**: The single current brief for one conversation,
  about 150 tokens, storing decisions, facts, and pending items that remain
  in force, plus the point in the conversation through which messages have
  already been folded in.
- **Recent window**: The eight most recent prior messages of a conversation.
  These stay verbatim in the answer context.
- **Departed group**: The oldest eight messages that have left the recent
  window and are not yet covered by the saved summary. One group produces one
  merged summary update.
- **Summarize event**: A trace event recorded only when a new summary is
  saved. Its type is `summarize` and its content is the summary that was
  saved.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In every tested turn, the verbatim history contains at most the
  eight most recent prior messages, in chronological order, and contains no
  older message verbatim.
- **SC-002**: In every tested case where eight messages have newly left the
  recent window, exactly one new summary is saved for that group, its
  estimated length is between 1 and 200 tokens with a target of about 150,
  and the following answer context includes that summary.
- **SC-003**: In every tested turn where fewer than eight uncovered messages
  have left the window, the saved summary text and its covered range stay
  identical and no `summarize` event is recorded.
- **SC-004**: In every tested merge, decisions, facts, and still-open pending
  items from the previous summary remain, new ones from the eight messages are
  added, resolved pending items are absent, and a contradicted fact appears
  only in its newer form.
- **SC-005**: Across tested conversations, 100% of summaries used for an
  answer belong to that same conversation.
- **SC-006**: In every tested failed summary update, the previously saved
  summary remains unchanged and the turn is not reported as successful.

## Assumptions

- Every stored user or assistant message counts as one message. The current
  turn's new message is not part of the prior window until it has been stored.
- The verbatim window is fixed at eight messages. For answer context, this
  replaces the earlier behavior of copying up to twelve prior messages. The
  earlier history threshold is not a second, larger verbatim copy.
- Messages that have left the window but are fewer than eight since the last
  summary are intentionally omitted until the next group of eight is complete.
  They are not kept verbatim in the meantime.
- "Approximately 150 tokens" uses the product's existing estimate of one token
  per four characters, rounded down. The target is about 150 tokens. A saved
  summary must stay within 1 to 200 estimated tokens so a slightly longer
  brief is accepted and an unbounded brief is not.
- The merge does not reread history that is already inside the saved summary.
  The previous summary is the memory of that older history.
- One conversation has one current summary row. Replacing it on each accepted
  merge is the whole history of the brief; a log of earlier summary versions
  is out of scope.
- The `summarize` event belongs to the same turn trace operators already
  receive. It records that a summary was saved; it is not a separate
  notification channel.
- Tests use a stand-in summarizer that returns a deterministic brief. The
  stand-in is how preservation, length, merge inputs, and the event are
  verified without a live model. Persistence follows the same conversation
  storage conventions already used for messages.
- Semantic memory, token budgets, billing, and manual editing or deletion of a
  summary are out of scope. A summary is removed only as part of the
  conversation's existing retention lifecycle, which this feature does not
  change.
- Existing failure behavior still applies to conversation lookup and answer
  generation. This feature adds the same explicit-failure rule to summary
  updates.
