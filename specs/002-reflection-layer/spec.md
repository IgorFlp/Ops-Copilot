# Feature Specification: Reflection Layer

**Feature Branch**: Not assigned

**Created**: 2026-10-22

**Status**: Draft

**Input**: Add a reusable reflection layer that decorates a reasoning strategy, evaluates its answer against trace observations with a same-model critic, regenerates rejected answers using feedback, records critiques in the trace, accounts for the extra model calls, and exposes reflected ReAct and plan-and-execute strategies in the arena.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Improve a strategy answer through reflection (Priority: P1)

As an operator or developer using a reasoning strategy, I need to apply reflection without replacing the underlying strategy so that unsupported or incomplete answers can be revised using the evidence and critique available from the run.

**Why this priority**: Reusing reflection across strategies is the central value of the feature and allows the same improvement loop to work with both existing reasoning approaches.

**Independent Test**: Wrap a deterministic strategy fixture, provide an answer and observations, then verify that an approved answer is returned immediately and a rejected answer is regenerated with the critic's feedback in context.

**Acceptance Scenarios**:

1. **Given** a strategy returns an answer and trace observations and the critic approves, **When** reflection runs, **Then** the decorated strategy returns the answer without regenerating it.
2. **Given** a strategy returns an answer and the critic rejects it with feedback, **When** reflection continues, **Then** the strategy is run again with that feedback available in its context.
3. **Given** the strategy has no trace observations, **When** the critic evaluates its answer, **Then** it evaluates against the observations available (none) and does not treat absent evidence as an observation.

### User Story 2 - Understand the critique and cost of a reflected run (Priority: P1)

As an operator or evaluator, I need to inspect each critique and the complete model-call count so that I can understand why an answer was revised and what additional work reflection required.

**Why this priority**: Reflection changes the returned answer and incurs extra model calls; both the reasoning trace and metrics must make that behavior reviewable.

**Independent Test**: Run a fixture that rejects once and then approves; verify ordered critique events, each critique's approval and feedback, the final answer, and metrics that include base, critic, and regeneration calls.

**Acceptance Scenarios**:

1. **Given** a critic returns a decision and feedback, **When** the trace is inspected, **Then** a `critique` event records that decision and feedback in the order the critique occurred.
2. **Given** a reflected run performs extra model calls, **When** its metrics are inspected, **Then** its call count includes every base-strategy, critic, and regeneration call and its elapsed time covers the complete run.
3. **Given** the maximum number of regenerations is reached after a rejected critique, **When** reflection stops, **Then** it returns the last regenerated answer without another critique.

### User Story 3 - Select reflected strategies in the arena (Priority: P2)

As an operator comparing reasoning approaches, I need to select reflected ReAct or plan-and-execute in the arena so that I can run the same operational question through either strategy with reflection.

**Why this priority**: Arena access makes the reusable capability directly usable and comparable through the project's existing strategy-running workflow.

**Independent Test**: Select each reflected strategy separately and together using a deterministic model fixture; verify each result has its own final answer, critique-bearing trace, and complete metrics.

**Acceptance Scenarios**:

1. **Given** the arena receives `reflect:react`, **When** the request is run, **Then** it executes the ReAct strategy with reflection and returns that strategy's result.
2. **Given** the arena receives `reflect:plan-and-execute`, **When** the request is run, **Then** it executes plan-and-execute with reflection and returns that strategy's result.
3. **Given** the arena receives both reflected strategy names and a reflection limit, **When** it runs them, **Then** both receive the same input and configured limit and return separate results.
4. **Given** an arena request has an invalid reflection limit or unknown strategy name, **When** it is submitted, **Then** it fails explicitly without starting an invalid run.

### Edge Cases

- The critic returns an invalid or incomplete structured decision.
- The critic, base strategy, or a regeneration call fails.
- The critic repeatedly rejects answers until the configured regeneration limit is exhausted.
- The configured regeneration limit is negative, fractional, or greater than 100.
- The trace has no observations, or observations are insufficient to support the answer.
- The critic approves the original answer or any regenerated answer.
- Reflection stops at its limit with a final answer that has not received an additional critique.
- A base strategy already returns a trace event of type `critique`; newly generated critique events must remain distinguishable by their recorded order and content.
- A rejected answer follows a successful state-changing action; a regeneration must not repeat that completed action merely because the answer was rejected.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A caller MUST be able to decorate any reasoning strategy using `withReflection(strategy, opts)` while preserving the strategy's answer, trace, and metrics result contract.
- **FR-002**: Reflection MUST run the wrapped strategy before requesting a critique.
- **FR-003**: The critic MUST use the same model as the wrapped strategy and MUST return a structured decision containing a boolean `approved` value and textual `feedback`.
- **FR-004**: The critic MUST evaluate the current answer against the observations available in that run's trace. It MUST NOT treat missing observations as supporting evidence.
- **FR-005**: Every critic decision MUST be added to the trace as a `critique` event containing its approval decision and feedback, in the order it was produced. The approval decision MUST be available as a boolean field; the event content MUST carry the feedback.
- **FR-006**: When a critique rejects an answer and the regeneration limit has not been reached, reflection MUST run the wrapped strategy again with the critique feedback available in the generation context.
- **FR-007**: Reflection MUST stop when the critic approves an answer or the configured regeneration limit is reached. After a rejection that exhausts the limit, it MUST perform the final allowed regeneration and return that answer without another critique.
- **FR-008**: `maxReflection` MUST default to 2 regenerations. A value of zero MUST allow the initial critique but no regeneration. Values MUST be integers from 0 through 100; values outside that range MUST be rejected explicitly.
- **FR-009**: Result metrics MUST include all model calls made by the wrapped strategy, critic, and regenerations. Elapsed latency MUST cover the complete reflected run.
- **FR-010**: The arena HTTP API and developer CLI MUST expose the reflected strategies as `reflect:react` and `reflect:plan-and-execute`; they MUST allow an optional `maxReflection` value for these strategies and use the default when omitted.
- **FR-011**: Reflection MUST preserve the wrapped strategy's trace events and add critique events in chronological order without replacing earlier observations.
- **FR-012**: A failure from the wrapped strategy, critic, structured decision parsing, or regeneration MUST be surfaced as a failed run rather than a successful answer.
- **FR-013**: Regenerations MUST retain observations and successfully completed actions from earlier attempts in the reflected run, and MUST NOT repeat a completed state-changing action solely because an answer was rejected.

### Key Entities *(include if data involved)*

- **Reasoning strategy**: A reusable operation that produces an answer, trace, and run metrics for an input.
- **Critique**: A structured approval decision and feedback evaluating a generated answer against observations in its trace.
- **Reflected result**: The final answer, preserved and extended ordered trace, and aggregate metrics produced by a strategy with reflection.
- **Reflection limit**: The maximum number of answer regenerations permitted after a rejected critique.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In every successful reflected run, the initial strategy runs once and the number of regenerations is no greater than the configured `maxReflection`.
- **SC-002**: With the default limit, a run can perform at most two regenerations; if both allowed regenerations follow rejected critiques, the second regenerated answer is returned without a third critique.
- **SC-003**: Every critic decision performed in a run appears exactly once as a `critique` trace event containing the same approval decision and feedback.
- **SC-004**: In deterministic call-count tests, reported metrics equal the total calls made by the wrapped strategy, critic, and regenerations; reported elapsed time covers the entire reflected run.
- **SC-005**: Each reflected arena strategy can be selected independently and returns a separate answer, ordered trace, and metrics for the submitted input.
- **SC-006**: Invalid reflection limits and failures from any reflection stage never produce a success-shaped result.
- **SC-007**: In every retry test that includes a successfully completed state-changing action, that action is performed no more than once across the reflected run.

## Assumptions

- `maxReflection` counts regenerations, not critique decisions. A rejected critique triggers a regeneration even when it was produced at the limit; the returned final regeneration is not critiqued again.
- The critic uses the wrapped strategy's configured model and evaluates whatever observations the strategy has produced, including an empty observation set.
- A zero regeneration limit still performs one critique of the initial answer, but does not regenerate a rejected answer.
- `maxReflection` is bounded from 0 to 100, matching the arena's existing upper bound for iteration limits and preventing unbounded extra model calls.
- Arena clients may set `maxReflection` for reflected strategies; when omitted, the default of two applies.
- Successfully completed state-changing actions and their observations are retained across regeneration so that answer retries do not repeat those actions.
- Existing unreflected strategy names and behavior remain available and unchanged.
