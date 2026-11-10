# Feature Specification: War Room Web

**Feature Branch**: `016-war-room-web`

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "War room web (Vite+react+TS) com as instructions de design: chat -> /chat, com "Ver raciocinio" abrindo o trace tipado. 202 vira cartão aprovar/negar, engrenagem com url da api, base /opspilot/; CORS"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Chat with the copilot from the war room (Priority: P1)

An on-call operator opens the war room, goes to the chat screen, sends a message about an alert or incident, and receives the copilot's answer together with the request metrics and a stable request identifier.

**Why this priority**: Conversing with the copilot is the core purpose of the war room; without it the remaining capabilities have nothing to act on.

**Independent Test**: Open the chat screen, submit a valid message against a deterministic API fixture, and verify the answer, metrics, and request identifier are displayed.

**Acceptance Scenarios**:

1. **Given** the operator is on the chat screen, **When** they submit a non-empty message, **Then** the message appears in the conversation and the copilot's answer is displayed with its metrics and request identifier.
2. **Given** a successful answer, **When** the operator sends a follow-up message, **Then** the conversation continues under the same conversation context.
3. **Given** the operator submits an empty or whitespace-only message, **When** they try to send it, **Then** the message is not sent and a clear validation message is shown.

---

### User Story 2 - Inspect the typed reasoning trace (Priority: P1)

An operator wants to understand how the copilot reached an answer. They select "Ver raciocínio" on a response and a panel opens showing the ordered trace, with each event presented according to its type and structured details.

**Why this priority**: Trust in an on-call copilot depends on being able to audit its reasoning; the trace is the primary evidence of what happened.

**Independent Test**: Produce a response with a trace containing several event types, open "Ver raciocínio", and verify every event is shown in order with its type and structured fields.

**Acceptance Scenarios**:

1. **Given** a response that includes a trace, **When** the operator selects "Ver raciocínio", **Then** a panel opens listing the trace events in their original order.
2. **Given** a trace event of a known type, **When** it is displayed, **Then** it shows a type label and its structured details, including node, timestamp, tools, arguments, and approval status when present.
3. **Given** a trace event of an unrecognized type, **When** it is displayed, **Then** it is still shown with its raw content instead of being dropped.
4. **Given** the trace panel is open, **When** the operator closes it, **Then** the conversation remains intact and the panel can be reopened.

---

### User Story 3 - Decide a pending approval (Priority: P1)

When the copilot needs human authorization before acting, the API accepts the request as pending and the war room shows an approve/deny card describing the proposed action. The operator approves or denies it and sees the outcome.

**Why this priority**: A pending action that cannot be decided blocks the incident workflow; the approval card is what makes the copilot safe to operate.

**Independent Test**: Return a pending-acceptance response from a deterministic API fixture, verify the approve/deny card appears with the proposed action, submit a decision, and verify the UI reflects the result.

**Acceptance Scenarios**:

1. **Given** the API accepts a request as pending, **When** the response is received, **Then** an approve/deny card is shown describing the proposed action and the pending request.
2. **Given** the approve/deny card is shown, **When** the operator approves, **Then** the decision is submitted and the card reflects the approved outcome.
3. **Given** the approve/deny card is shown, **When** the operator denies, **Then** the decision is submitted and the card reflects the denied outcome.
4. **Given** a decision submission fails, **When** the failure is returned, **Then** the card remains actionable and shows a clear error with a retry option.

---

### User Story 4 - Configure the API endpoint (Priority: P2)

An operator opens the settings gear, sets the API base URL for the environment they are working in, and the war room uses that endpoint for subsequent requests. The setting survives a page reload.

**Why this priority**: Operators work across environments; pointing the war room at the right API is required for it to be usable outside a single fixed deployment.

**Independent Test**: Open settings, enter a valid API URL, save, reload the page, and verify the saved URL is still in effect and used for the next request.

**Acceptance Scenarios**:

1. **Given** the operator opens the settings gear, **When** the settings panel appears, **Then** it shows the current API base URL and allows editing it.
2. **Given** the operator saves a valid API base URL, **When** they send a chat message, **Then** the request is sent to that URL.
3. **Given** the operator saves a valid API base URL, **When** they reload the page, **Then** the saved URL is restored and used.
4. **Given** the operator enters an invalid or empty API base URL, **When** they try to save, **Then** the value is rejected with a clear message and the previous value is kept.

---

### User Story 5 - Reach the war room under its deployment path (Priority: P2)

An operator opens the war room at its deployment path, navigates directly to the chat screen, and the application loads correctly with all assets and routes working.

**Why this priority**: The war room is deployed under a fixed path; broken asset or route resolution makes the whole application unreachable.

**Independent Test**: Load the application at its deployment path, navigate directly to the chat route, refresh the page, and verify the application and its assets load without errors.

**Acceptance Scenarios**:

1. **Given** the application is deployed under its configured base path, **When** the operator opens that path, **Then** the application loads with all assets resolved.
2. **Given** the operator opens the chat route directly, **When** the page loads or is refreshed, **Then** the chat screen is shown instead of a not-found page.
3. **Given** the application is served from its base path, **When** it calls the configured API, **Then** the cross-origin request is accepted by the API.

---

### Edge Cases

- The API base URL is empty, malformed, or unreachable; the operator must see a clear, actionable error and the previous valid configuration must be preserved.
- A pending-acceptance response arrives without enough detail to describe the proposed action; the card must still be shown with the available information and must not silently disappear.
- The operator submits a decision twice or on a stale card; the UI must prevent duplicate submissions and show the authoritative outcome.
- A response contains an empty trace; "Ver raciocínio" must indicate that no reasoning was recorded instead of opening an empty panel.
- A trace contains many events; the panel must remain usable and must not truncate the trace.
- The API returns validation, unsupported-strategy, not-found, timeout, model-unavailable, or internal errors; each must be shown as a distinct, understandable state.
- The network is slow or the request is still running; the UI must show a loading state and must not present a partial result as complete.
- The operator reloads the page mid-conversation; the conversation must not be presented as complete if it was not persisted.
- The application is opened at a deep link under the base path and refreshed; routing must still resolve.
- The API rejects a cross-origin request; the operator must see a clear connectivity error rather than a silent failure.
- The operator uses keyboard only, a screen reader, or a dark color scheme; all flows must remain usable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a web war room served under the `/opspilot/` base path, with all assets and client-side routes resolving correctly under that path, including on direct navigation and refresh.
- **FR-002**: The system MUST expose the chat experience at the `/chat` route.
- **FR-003**: Users MUST be able to submit a non-empty message to the copilot and see it added to the conversation.
- **FR-004**: The system MUST send chat requests to the configured API endpoint and MUST include the operator identity, the message, and the conversation context required for continuity.
- **FR-005**: The system MUST display the copilot's answer, the request metrics, and the request identifier for each successful response.
- **FR-006**: The system MUST provide a "Ver raciocínio" control on responses that include a trace.
- **FR-007**: Selecting "Ver raciocínio" MUST open a panel that lists the trace events in their original order.
- **FR-008**: Each trace event MUST be presented according to its type and MUST show its structured details when present, including node, timestamp, tools, arguments, and approval status.
- **FR-009**: Trace events with an unrecognized type MUST still be displayed with their raw content.
- **FR-010**: When the API accepts a request as pending human approval, the system MUST render an approve/deny card describing the proposed action and the pending request.
- **FR-011**: The approve/deny card MUST let the operator submit an approval or a denial decision and MUST reflect the resulting outcome.
- **FR-012**: The system MUST prevent duplicate or stale approval decisions and MUST keep the card actionable when a decision submission fails.
- **FR-013**: The system MUST provide a settings control (gear) that shows and edits the API base URL.
- **FR-014**: The system MUST validate the API base URL before saving, reject empty or malformed values, and preserve the previous valid value on rejection.
- **FR-015**: The system MUST persist the API base URL locally and restore it across page reloads.
- **FR-016**: The system MUST use the configured API base URL for all API requests.
- **FR-017**: The system MUST present distinct, understandable states for loading, empty results, validation errors, unsupported strategies, not-found requests, timeouts, model unavailability, internal failures, and connectivity failures.
- **FR-018**: The system MUST NOT present a failed or partial request as a successful or complete result.
- **FR-019**: The API MUST accept cross-origin requests from the war room origin, including the preflight requests required by the browser.
- **FR-020**: The system MUST follow the project's design instructions for hierarchy, spacing scale, empty and error states, dark mode, and accessibility.
- **FR-021**: Automated tests MUST cover the chat flow, typed trace rendering, pending-approval decisions, API URL configuration and persistence, base-path routing, and error states, using deterministic API fixtures without network access.

### Key Entities *(include if feature involves data)*

- **Chat Message**: A message exchanged in the conversation, with its author (operator or copilot), content, and position in the conversation.
- **Chat Response**: The copilot's answer for a request, including its metrics, request identifier, conversation identifier, and optional trace.
- **Trace Event**: One step of the copilot's reasoning, with a type, content, originating node, timestamp, and optional tools, arguments, and approval status.
- **Pending Approval**: A request accepted but awaiting a human decision, with an identifier, a description of the proposed action, and a status.
- **Approval Decision**: The operator's approve or deny choice for a pending approval, with its resulting status.
- **API Configuration**: The operator-selected API base URL used for all requests, persisted locally.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can send a message and see the copilot's answer, metrics, and request identifier without leaving the chat screen.
- **SC-002**: 100% of trace events in a response are displayed in their original order, each with its type and available structured details.
- **SC-003**: 100% of pending-acceptance responses produce an approve/deny card, and 100% of submitted decisions are reflected in the card.
- **SC-004**: A saved API base URL is restored and used after a page reload in 100% of cases.
- **SC-005**: The application loads successfully at its base path and on direct navigation to the chat route, with zero broken asset or route errors.
- **SC-006**: 100% of tested error conditions display a distinct, understandable state and never a success-shaped result.
- **SC-007**: All primary flows are operable by keyboard alone, and the interface meets the project's accessibility and dark-mode requirements.
- **SC-008**: Cross-origin requests from the war room origin succeed, including browser preflight requests.

## Assumptions

- The war room is a new web application built with Vite, React, and TypeScript, as explicitly requested; the stack is a given constraint and not a design decision of this specification.
- The existing chat API is the source of answers, traces, metrics, and request identifiers; the war room consumes it rather than reimplementing reasoning.
- A pending-acceptance response (status 202) carries a pending approval identifier and enough information to describe the proposed action; the API exposes a way to submit the approve/deny decision. The exact decision contract is defined during planning.
- The API base URL defaults to a sensible value for the current environment and is overridable through the settings gear; the default is documented during planning.
- Cross-origin support is added to the API for the war room origin; the war room does not rely on disabling browser security.
- Operator identity is provided by the war room (for example, a configured or generated operator identifier); full authentication and authorization are out of scope for this feature.
- Conversation continuity uses the conversation identifier returned by the API; long-term conversation history browsing is out of scope.
- The design instructions in `.github/instructions/design.instruction.md` (mirrored in `web/AGENTS.md`) are mandatory for this feature.
- The war room is a client-side application; server-side rendering and offline support are out of scope.
- Retention, rotation, and deletion of persisted requests and traces remain owned by the API and are out of scope.
