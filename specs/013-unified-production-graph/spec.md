# Feature Specification: Unified Production Graph

**Feature Branch**: `013-unified-production-graph`

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "Grafo unificado

- production-graph.ts: nós, contexto, roteador, as 3 estrategias como nós de resposta.
- Roteador: withStrucuredOutput (route, reason), tabela no prompt, evento "route" e campo node em todo evento de trace
- /chat: strategy opcional (se vier use override no trace)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Route a chat request to an appropriate response strategy (Priority: P1)

As an operations user, I want my request and relevant conversation context to be handled through one consistent flow, so that the assistant can choose an appropriate response strategy and return an answer.

**Why this priority**: Automatic strategy selection is the primary purpose of unifying the production flow.

**Independent Test**: Submit representative incident and operational questions without specifying a strategy; verify each request produces an answer through one of the supported response strategies and records the routing decision.

**Acceptance Scenarios**:

1. **Given** a valid chat request without `strategy` or `reflect`, **When** the assistant handles it, **Then** the router selects exactly one supported response strategy and the selected strategy returns the answer.
2. **Given** the request includes available conversation context, **When** the request is routed and answered, **Then** the selected strategy receives that context.
3. **Given** the router selects a strategy, **When** the response trace is returned, **Then** a `route` event identifies the selected strategy and explains the choice.
4. **Given** the router is choosing among supported strategies, **When** it evaluates the request, **Then** its guidance distinguishes all three choices and their intended use.

### User Story 2 - Explicitly choose a response strategy (Priority: P1)

As an API client, I want to optionally specify a response strategy, so that I can override automatic selection when a particular strategy is required.

**Why this priority**: Existing clients and callers need predictable control for workflows that require a specific strategy.

**Independent Test**: Submit the same valid request with each supported `strategy` value and verify the requested strategy is used and represented in the trace rather than replaced by the router.

**Acceptance Scenarios**:

1. **Given** a valid request with `strategy` set to a supported value, **When** the request is handled, **Then** that strategy is used as an override and the trace records it.
2. **Given** a request with no `strategy`, **When** the request is handled, **Then** the system uses the router instead of assuming a fixed strategy.
3. **Given** a request with an unsupported `strategy`, **When** the request is validated, **Then** the caller receives the established explicit unsupported-strategy error and no alternate strategy is silently selected.
4. **Given** a request with `reflect` enabled and no `strategy`, **When** the request is handled, **Then** the reflected ReAct response node is selected.

### User Story 3 - Understand the path taken to an answer (Priority: P2)

As an operations user reviewing a chat result, I want every trace event to identify its originating node, so that I can follow context preparation, routing, and answer generation.

**Why this priority**: Node attribution makes the unified flow observable and makes route decisions distinguishable from strategy work.

**Independent Test**: Exercise automatic routing and an explicit override, then inspect every returned trace event for a node attribution and a meaningful route event.

**Acceptance Scenarios**:

1. **Given** a request that produces trace events, **When** the trace is returned, **Then** every event, including existing context-summary events, contains a `node` value identifying its origin.
2. **Given** a request handled by the router, **When** its route event is returned, **Then** that event includes both the selected strategy and the router's reason.
3. **Given** a request with an explicit strategy override, **When** its trace is returned, **Then** the trace identifies the overridden strategy and does not imply that the router selected it.
4. **Given** an existing client reads a chat result, **When** it receives a result after the change, **Then** the answer, conversation identifier, and metrics remain available.

### Edge Cases

- If the router returns a route outside the supported set or omits its reason, the request fails explicitly rather than silently falling back to a strategy.
- If `strategy` is present but empty or unsupported, request validation or strategy resolution returns an explicit error; it does not trigger automatic routing.
- If context contains no history, memories, or summary, the current user message is still available to routing and response generation.
- If the selected strategy fails, the request follows the existing chat failure behavior and does not return a success-shaped response.
- When a request uses the existing `reflect` option without `strategy`, it continues to select the reflected ReAct response node; an explicit `strategy` takes precedence.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The chat flow MUST prepare the request context once and make it available to both routing and the selected response strategy.
- **FR-002**: When neither a `strategy` override nor the legacy `reflect` option is supplied, the router MUST select exactly one of the supported response strategies: `react`, `plan-and-execute`, or `reflect:react`.
- **FR-003**: The router MUST produce a structured decision containing a supported `route` and a non-empty `reason`.
- **FR-004**: The router's decision guidance MUST present the available routes and their intended use in a route-selection table.
- **FR-005**: The returned trace MUST contain a `route` event for the routing decision, including the selected route and reason.
- **FR-006**: A chat request MUST accept `strategy` as an optional field. When omitted, the router selects the response strategy; when supplied with a supported value, it overrides routing and is represented in the trace.
- **FR-007**: An unsupported explicit strategy or invalid router decision MUST fail explicitly and MUST NOT silently fall back to another response strategy.
- **FR-008**: The unified flow MUST provide three response strategy nodes: ReAct, Plan-and-Execute, and ReAct with reflection.
- **FR-009**: Every trace event returned by chat MUST include a `node` value identifying the node that produced it, including route, context, summary, and response-strategy events.
- **FR-010**: An explicit strategy override MUST be distinguishable in the trace from a route selected automatically by the router.
- **FR-011**: The response MUST preserve existing chat result behavior unrelated to strategy selection and trace attribution, including the answer, conversation identifier, and metrics.
- **FR-012**: The existing `reflect` option MUST remain supported; when `strategy` is omitted and `reflect` is true, the reflected ReAct response node is selected. A supplied `strategy` takes precedence.
- **FR-013**: Automated tests MUST cover automatic route selection, explicit overrides, invalid strategy/route handling, and the presence of `node` on every trace event.

### Key Entities

- **Request Context**: The current message and available conversation context passed to the router and selected response strategy.
- **Route Decision**: The selected supported response strategy and the reason for selecting it.
- **Response Strategy Node**: One of the three supported answer-producing choices: ReAct, Plan-and-Execute, or ReAct with reflection.
- **Trace Event**: An event describing work in the chat flow, with its event type, content, and originating node.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of valid requests without an explicit strategy override, exactly one supported response strategy is selected and produces the answer.
- **SC-002**: In 100% of returned chat traces, every event has a node attribution, and every routing decision is accompanied by a route and reason.
- **SC-003**: In 100% of valid requests with an explicit strategy override, the requested strategy is used and traceable as an override rather than a router decision.
- **SC-004**: All three supported response strategies can independently produce a chat answer using the same prepared request context.
- **SC-005**: Operations users can identify the selected strategy and the reason for automatic selection from the returned trace alone.

## Assumptions

- The supported strategy identifiers are `react`, `plan-and-execute`, and `reflect:react`; the latter represents ReAct with reflection.
- Omitting `strategy` enables automatic routing instead of preserving the former fixed `react` default.
- For backward compatibility, `reflect: true` without a strategy selects `reflect:react`; a supplied strategy is authoritative.
- Route decisions that do not match the supported identifiers are treated as explicit failures, not repaired by choosing a default.
- Context, routing, and strategy events use stable node identifiers so consumers can attribute every trace event consistently.
