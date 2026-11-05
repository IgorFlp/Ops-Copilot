# Feature Specification: Context Token Metrics

**Feature Branch**: `010-context-token-metrics`

**Created**: 2026-11-05

**Status**: Draft

**Input**: User description: Distinguish model-reported prompt-token usage from estimated context size by source, print prompt usage for every long-conversation turn, and add tests.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inspect prompt usage and context sources (Priority: P1)

As an on-call operator, I want each chat response to distinguish the model's
reported prompt-token usage from estimates for the context sources, so that I
can understand context growth without mistaking an estimate for actual usage.

**Why this priority**: Reliable, clearly labeled usage is the core value of this
feature and makes long-running incident conversations observable.

**Independent Test**: Exercise a chat response with provider-reported usage and
multiple context sources, then verify the reported prompt count matches the
provider count and the separate breakdown provides estimates for the sources.

**Acceptance Scenarios**:

1. **Given** a successful model call with provider-reported prompt usage,
   **When** the chat response is returned, **Then** its actual prompt-token
   count equals the reported prompt-token count.
2. **Given** a chat context containing a current request, conversation history,
   and recalled memories, **When** the response is returned, **Then**
   `metrics.contextBreakdown` reports separately labeled estimates for each
   included source.
3. **Given** a model response without provider-reported prompt usage,
   **When** the chat response is returned, **Then** `metrics.promptTokens` is
   omitted and no estimate is presented as actual usage.

### User Story 2 - Track usage during a long conversation (Priority: P2)

As an operator running the long-conversation exercise, I want the output to
show the actual prompt-token usage for every turn, so that I can observe how
usage changes as the conversation grows.

**Why this priority**: Per-turn visibility makes it practical to compare
context growth across a complete conversation.

**Independent Test**: Run the exercise with a sequence of responses containing
reported usage and verify every completed turn prints its corresponding value.

**Acceptance Scenarios**:

1. **Given** multiple successful chat turns with reported usage, **When** the
   exercise prints its results, **Then** each turn displays that turn's actual
   `metrics.promptTokens` value.
2. **Given** a successful turn without reported usage, **When** the exercise
   prints its results, **Then** that turn is explicitly marked unavailable
   rather than displaying an estimate as actual usage.

### Edge Cases

- A source with no content contributes zero estimated tokens; a source not
  included in the context is absent from the breakdown.
- Very short and empty source content produces a non-negative estimate using
  the documented rounding rule.
- Provider usage metadata may be missing even when an estimated breakdown is
  available.
- A chat request may include no history or no recalled memories; the breakdown
  still accurately represents the sources that were included.
- A failed chat turn is reported as a failure and is not printed as a
  successful turn with fabricated metrics.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a consistent estimate of one token per
  four input Unicode code points, rounded down, and MUST return a
  non-negative integer.
- **FR-002**: Each successful `/chat` response MUST expose
  `metrics.contextBreakdown`, with a separately labeled estimated token
  contribution for each context source included in that response.
- **FR-003**: The context breakdown MUST distinguish, when present, the current
  user request, prior conversation history, and retrieved memories. Sources
  not included in the chat input MUST NOT appear in the breakdown.
- **FR-004**: The system MUST populate `metrics.promptTokens` only with the sum
  of actual prompt-token counts reported for every model invocation made for
  the chat request. If any invocation does not report prompt-token usage, the
  field MUST be omitted; an estimate or partial total MUST NOT be substituted.
- **FR-005**: The actual prompt-token count and estimated source breakdown MUST
  be presented as distinct measurements and MUST NOT be described as
  interchangeable or equally precise.
- **FR-006**: The long-conversation exercise MUST print the actual
  `metrics.promptTokens` value for each successful turn when available and
  explicitly indicate when it is unavailable.
- **FR-007**: Automated tests MUST cover the character-based estimate,
  source-specific breakdown, actual usage propagation, missing usage behavior,
  and per-turn output of the long-conversation exercise.
- **FR-008**: Adding these measurements MUST NOT change existing chat behavior
  or other response values.

### Key Entities

- **Prompt usage**: The prompt-token count reported by the model integration
  for a chat operation; it is actual usage and may be unavailable.
- **Context source estimate**: A rounded-down character-based estimate
  associated with one identifiable source included in the model context.
- **Turn metrics**: The actual prompt usage, when available, and estimated
  context-source contributions associated with one chat turn.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In all tested responses where every model invocation reports
  prompt usage, `metrics.promptTokens` equals the sum of those reported values.
- **SC-002**: In all tested responses where at least one model invocation
  omits prompt usage, `metrics.promptTokens` is absent; neither an estimate nor
  a partial total is substituted.
- **SC-003**: Every context source included in tested chat inputs has a
  separately identifiable estimate calculated using the documented
  four-characters-per-token, round-down rule.
- **SC-004**: Every successful turn in the long-conversation exercise prints
  the matching actual prompt usage or an explicit unavailable indicator.

## Assumptions

- Both measurements are exposed with the existing chat response's diagnostic
  information; they do not alter the chat conversation itself.
- Provider-reported prompt usage is authoritative. When it cannot be obtained,
  actual usage is omitted rather than inferred.
- Estimates are diagnostic approximations based on characters, not a tokenizer
  result, cost calculation, quota, or context-window guarantee.
- Character counts use Unicode code points, and each source is rounded down
  once after its included text has been counted.
- The source breakdown estimates the chat input's current request, prior
  history, and retrieved memories once per turn; it does not multiply those
  estimates by the number of model calls.
- The source breakdown excludes agent instructions, tool schemas, model-side
  serialization, and provider-side formatting or tokenization overhead.
- Actual prompt usage is aggregated across all model invocations for the chat
  run, including tool cycles and reflection calls; the total is omitted if any
  such invocation lacks reported prompt usage.
- Existing error handling remains responsible for failed chat turns; the
  exercise must not convert failures into successful metric output.
- The scope is measurement and visibility only; token-based truncation,
  budgeting, billing, and alerting are out of scope.
