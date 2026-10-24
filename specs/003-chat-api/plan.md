# Implementation Plan: Chat API

**Branch**: `003-chat-api` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-chat-api/spec.md`

## Summary

Expose a single-request chat endpoint that validates a message and optional
strategy/reflection selection, resolves a named strategy through a registry,
and returns the existing reasoning result shape. Use the existing Express
application, Zod boundary validation, DomainError/error middleware patterns,
and a deterministic injected registry for end-to-end tests. An explicit
180-second deadline maps to HTTP 504; strategy failures remain failures and are
not returned as successful results.

## Technical Context

**Language/Version**: TypeScript ESM, Node.js 22 LTS, strict mode

**Primary Dependencies**: Express, Zod, LangChain strategy interfaces and
existing `withReflection` decorator

**Storage**: N/A for the chat endpoint itself; selected operational strategies
may use existing PostgreSQL-backed services.

**Testing**: `node:test` via `tsx`; `npm run typecheck` and `npm test`

**Target Platform**: Node.js HTTP service

**Project Type**: Express web service

**Performance Goals**: Return a 504 response when strategy execution exceeds
180 seconds; no additional latency target is specified for requests that
complete before the deadline.

**Constraints**: Validate input at the HTTP boundary; default to `react`;
reflection is opt-in; unknown strategies return 422; do not require model,
database, or other network access in integration tests; do not expose internal
errors as success responses.

**Scale/Scope**: One endpoint, a named strategy registry, optional reflection,
bounded request execution, and deterministic HTTP integration coverage.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **MVC boundaries**: PASS — HTTP parsing and status translation stay in the
  controller and middleware; the registry only resolves and runs domain
  strategies.
- **External input validation**: PASS — Zod validates the request body before
  strategy lookup or execution.
- **Domain errors**: PASS — represent unsupported strategy and deadline
  failures explicitly and translate them at the HTTP boundary without
  returning internal details.
- **Testing and quality**: PASS — inject fake strategies and reflection
  dependencies for deterministic `node:test` integration coverage.
- **Security and operations**: PASS — reject unknown fields, avoid leaking
  internal errors, and do not claim success after a failed or timed-out run.
- **Spec-first workflow**: PASS — this plan and design artifacts precede task
  generation and implementation.
- **Small, pure, reversible changes**: PASS — reuse the existing Express
  application, domain result types, middleware, and reflection decorator.

## Phase 0: Research

See [research.md](./research.md) for decisions on registry structure,
validation/error mapping, timeout semantics, and test seams.

## Phase 1: Design

- [Data model](./data-model.md): request, strategy registry, result, and
  validation/error entities.
- [HTTP contract](./contracts/chat-api.yaml): request/response and status
  schemas for `POST /chat`.
- [Quickstart](./quickstart.md): offline test scenarios and project validation
  commands.

### Post-Design Constitution Check

- **MVC boundaries**: PASS — request schema and controller remain in the HTTP
  layer; strategy execution is behind the registry.
- **Validation**: PASS — malformed bodies are rejected before service calls.
- **Error handling**: PASS — 400, 422, and 504 have distinct external
  semantics; execution failures do not return 200.
- **Testability**: PASS — registry, decorator, and deadline can be supplied via
  test dependencies without invoking network services.
- **Scope**: PASS — no persistence changes, authentication changes, or new
  public endpoints are introduced by this feature.

## Project Structure

### Documentation (this feature)

```text
specs/003-chat-api/
├── plan.md
├── research.md
├── data-model.md
├── contracts/
│   └── chat-api.yaml
└── quickstart.md
```

### Source Code (repository root)

```text
src/
├── agent/
│   └── index.ts                 # Named strategy registry and reflection choice
├── controllers/
│   ├── chat-controller.ts       # Request validation and chat response boundary
│   ├── chat-controller.test.ts  # Default and named strategy integration tests
│   ├── chat-errors.test.ts      # Validation, error, and deadline tests
│   └── chat-reflection.test.ts  # Opt-in reflection integration tests
├── routes/
│   └── chat-routes.ts           # POST /chat route
├── middleware/
│   └── error-handler.ts         # Translate unsupported strategy/deadline errors
└── app.ts                       # Register chat router in the Express app
```

**Structure Decision**: Extend the existing single Node.js project and Express
application. Use the requested `src/agent/index.ts` for a small registry that
maps names to the existing `src/agents` strategy implementations and applies
`withReflection` only when requested. Keep HTTP validation and response
translation in the established controller and middleware layers. Tests use an
in-process HTTP server and injected fake strategies.

## Complexity Tracking

No constitution violations or additional architectural projects are proposed.
