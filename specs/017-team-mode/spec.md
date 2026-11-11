# Feature Specification: Team Mode

**Feature Branch**: `017-team-mode`

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "Modo equipe em src/team/: supervisor com withStructuredOutput({next, brief}) sobre um blackboard de estado. Papeis: Analista (só leitura, não propoe nem executa), Planejador (sem tools), executor (Incidentes, sem bypass), Evento "handoff" no trace, renderizado no "ver raciocinio". Rota "team", teto 8"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Get an answer from a coordinated team of roles (Priority: P1)

An on-call operator sends a request and the copilot runs in team mode: a supervisor coordinates a set of specialized roles that collaborate over a shared working state until the supervisor concludes with a single answer. The operator reads one answer, produced by the team, without needing to know how the roles were organized.

**Why this priority**: The coordinated answer is the entire reason team mode exists; without it the roles, the trace and the route have nothing to produce.

**Independent Test**: Submit a request that selects the team route against deterministic fixtures, and verify that a single final answer is returned along with the contribution trail of the participating roles.

**Acceptance Scenarios**:

1. **Given** the operator selects the team route, **When** the request runs, **Then** a supervisor organizes the work of the specialized roles and returns one final answer.
2. **Given** a team run is in progress, **When** a role contributes to the shared working state, **Then** that contribution becomes available to the supervisor and to later roles within the same run.
3. **Given** the supervisor concludes the work, **When** the run ends, **Then** the final answer reflects the accumulated contributions rather than a single role's raw output.

---

### User Story 2 - Follow who handed work to whom (Priority: P1)

An operator opens "Ver raciocínio" on a team answer and sees, in order, each control transfer between the supervisor and a role, including who received the work and the brief that was passed along.

**Why this priority**: Team mode adds a new kind of collaboration, and operators must be able to audit who was asked to do what; without visible handoffs team mode is a black box.

**Independent Test**: Produce a team answer whose trace contains several handoffs and verify that "Ver raciocínio" lists each handoff in order with its source, target and brief.

**Acceptance Scenarios**:

1. **Given** a team answer that involved control transfers, **When** the operator opens "Ver raciocínio", **Then** every handoff is shown in its original position among the other trace events.
2. **Given** a handoff event is displayed, **When** the operator reads it, **Then** it identifies who handed off, who received, and the brief that was passed.
3. **Given** the trace contains handoffs and other event types mixed together, **When** it is displayed, **Then** handoffs and other events keep their original order and are distinguishable by type.
4. **Given** a client receives a handoff event but does not recognize its type, **When** it renders the trace, **Then** the event is still preserved and shown rather than dropped.

---

### User Story 3 - Rely on each role and on authorization limits (Priority: P1)

An operator needs assurance that the team respects the boundaries of each role: the Analyst only reads and analyzes, the Planner plans without touching any tool, and only the Executor may act on incidents, always under the existing authorization/approval rules with no shortcut.

**Why this priority**: Team mode multiplies the actors that can affect an incident; without enforced role boundaries it would be unsafe to run against production.

**Independent Test**: Run each role through deterministic fixtures and verify the Analyst proposes and executes nothing, the Planner invokes no tools, and the Executor's incident operations still require authorization.

**Acceptance Scenarios**:

1. **Given** the Analyst is engaged, **When** it contributes, **Then** it only reads/analyzes and neither proposes an action nor executes one.
2. **Given** the Planner is engaged, **When** it contributes, **Then** it uses no tools.
3. **Given** the Executor is engaged, **When** it attempts an incident operation, **Then** the operation still requires the existing authorization/approval before taking effect.
4. **Given** an operation would require authorization that is not present, **When** the Executor attempts it, **Then** the operation does not take effect and the outcome is recorded.

---

### User Story 4 - Trust that team runs are bounded (Priority: P2)

An operator expects a team run to finish. The supervisor's coordination is capped at a fixed number of handoffs (the ceiling of eight), and when the cap is reached the run stops and reports the best available outcome instead of looping forever or fabricating a success.

**Why this priority**: An unbounded multi-role loop would consume time and cost and could stall an incident; a deterministic ceiling is required for the mode to be operable.

**Independent Test**: Force a scenario in which the supervisor would keep delegating and verify the run stops at the ceiling of eight handoffs and returns an explicit outcome.

**Acceptance Scenarios**:

1. **Given** a team run reaches the ceiling of eight handoffs, **When** the supervisor would delegate again, **Then** the run stops and returns the best available answer or an explicit incomplete outcome.
2. **Given** a team run stops because of the ceiling, **When** the result is shown, **Then** it is not presented as a fully successful answer.
3. **Given** a normal team run, **When** the supervisor concludes earlier, **Then** the run ends before reaching the ceiling.

---

### Edge Cases

- The supervisor produces an invalid coordination decision (missing target actor or missing brief); the run must fail explicitly instead of silently guessing.
- The supervisor asks to hand off to an unknown or unavailable role; the run must reject that step explicitly.
- The supervisor repeatedly hands off to the same role; the ceiling must still stop the run.
- A role returns an empty or unusable contribution; the supervisor must be able to continue or conclude without presenting the empty contribution as a result.
- The Executor attempts a mutation without authorization; the operation must not take effect and the blocked attempt must be recorded.
- The team run reaches the ceiling without any role producing usable content; the outcome must be explicit and must not fabricate an answer.
- The team run exceeds its time budget; the failure must be surfaced as an error and not as a success.
- A stored or returned trace contains a handoff event but no role brief; the event must still be displayed with whatever is available.
- A client that predates team mode receives a handoff event; the trace must remain ordered and the unknown type must be preserved.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a team route, selectable for a chat request, in addition to the existing reasoning routes, and MUST reject route selections that are not recognized.
- **FR-002**: The team route MUST run a supervisor that coordinates a set of specialized roles over a shared working state that accumulates each role's contributions for the duration of the run.
- **FR-003**: At each coordination step the supervisor MUST produce a structured decision containing the next actor to engage and a brief describing what that actor should do.
- **FR-004**: The team MUST include an Analyst role that only reads and analyzes and MUST NOT propose an action nor execute one.
- **FR-005**: The team MUST include a Planner role that produces plans and MUST use no tools.
- **FR-006**: The team MUST include an Executor role that performs incident operations and MUST remain subject to the existing authorization/approval rules.
- **FR-007**: Team mode MUST NOT introduce any way to bypass the existing authorization/approval rules; operations that require authorization MUST still require it.
- **FR-008**: Only the Executor MAY cause operational side effects; the Analyst and the Planner MUST NOT cause side effects.
- **FR-009**: Every control transfer between the supervisor and a role MUST record a handoff trace event that identifies the source and the target of the transfer and the brief that was passed.
- **FR-010**: The team run MUST return a single final answer together with the full ordered trace, using the same response shape as the existing routes so that existing chat and trace experiences keep working unchanged.
- **FR-011**: The team run MUST be bounded to a ceiling of eight handoffs; when the ceiling is reached the run MUST stop and MUST return the best available answer or an explicit incomplete outcome.
- **FR-012**: A team run that reaches its ceiling or that cannot produce usable content MUST NOT be presented as a fully successful answer.
- **FR-013**: Failures of the supervisor or of any role MUST be surfaced as explicit errors and MUST NOT be presented as successful results.
- **FR-014**: The "Ver raciocínio" experience MUST render handoff events, showing who handed off, who received, and the brief, in their original order among the other trace events.
- **FR-015**: Trace events of unrecognized types, including handoff events received by clients that do not know the type, MUST still be preserved and displayed.
- **FR-016**: Automated tests MUST cover the supervisor's coordination decisions, each role's boundary, handoff trace events, the eight-handoff ceiling, the Executor's authorization requirement, the rejection of unknown routes, and the team route end-to-end, using deterministic fixtures without network access.
- **FR-017**: The team-mode user experience MUST follow the project's design instructions for hierarchy, spacing scale, empty and error states, dark mode, and accessibility.

### Key Entities *(include if feature involves data)*

- **Team Run**: One execution of the team route for a single request, comprising the shared working state, the ordered handoffs, and the final answer.
- **Supervisor Decision**: The structured coordination output for one step, containing the next actor to engage and a brief.
- **Team Role**: One of the specialized participants — Analyst (read-only), Planner (no tools), or Executor (incident operations under authorization) — each with a fixed capability boundary.
- **Shared Working State (blackboard)**: The accumulated contributions produced by the roles and read by the supervisor and later roles within a single run.
- **Handoff**: A control transfer between the supervisor and a role, carrying a source, a target, and the brief, and recorded as a trace event.
- **Handoff Ceiling**: The fixed maximum number of handoffs (eight) after which a run must stop.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A team request returns exactly one final answer accompanied by the ordered trail of the run's handoffs.
- **SC-002**: 100% of control transfers in a team run appear as recorded handoffs.
- **SC-003**: 100% of Analyst contributions contain neither a proposed action nor an executed action.
- **SC-004**: 100% of Planner contributions use zero tools.
- **SC-005**: 0 operations occur in team mode without the authorization required by the existing rules.
- **SC-006**: 100% of team runs terminate, and no run exceeds the ceiling of eight handoffs.
- **SC-007**: 100% of runs stopped by the ceiling or by a failure are reported as incomplete or failed, never as a fully successful answer.
- **SC-008**: 100% of handoff events in a trace are visible in "Ver raciocínio" in their original order and are distinguishable from other event types.
- **SC-009**: Unknown route selections are rejected in 100% of cases.
- **SC-010**: The team route's response is consumable by the existing chat and trace experiences without changes to those experiences.

## Assumptions

- Team mode is a new route in the existing reasoning-route mechanism and is selected the same way as the current routes (for example, an explicit route override or automatic routing); the exact selection contract is defined during planning.
- The supervisor produces its coordination decision as structured output with a next-actor field and a brief field, as explicitly requested; the field names and schema are given constraints of the request.
- Analista, Planejador and Executor are the three initial roles (Analyst, Planner and Executor respectively); their prompts and behaviours are defined during planning.
- The shared working state is scoped to a single team run and is not persisted beyond the request; long-term retention remains owned by the existing request/trace persistence.
- The ceiling of eight handoffs is the default maximum for a run; whether it is configurable is defined during planning, but the default of eight is fixed by this specification.
- The Executor's scope is incident operations, matching the existing operational tools, and it reuses the existing authorization/approval policy rather than introducing a new one.
- "No bypass" means team mode does not add any path that skips the existing authorization/approval; full redesign of the authorization model is out of scope.
- The handoff is a new trace event type; the existing trace rendering is extended to display it while remaining tolerant of unknown types.
- Team mode reuses the existing chat response contract (answer, trace, metrics, request identifier, conversation identifier), so no new response shape is required by consumers.
- The design instructions in `.github/instructions/design.instruction.md` (mirrored in `web/AGENTS.md`) are mandatory for any interface change introduced by this feature.
- Automatic routing into team mode (versus an explicit selection) is defined during planning; either way, an explicit selection of the team route MUST be supported.
