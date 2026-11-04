# Implementation Plan: Persistent Conversations

**Branch**: `main` | **Date**: 2026-11-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-persistent-conversations/spec.md`

## Summary

Make `/chat` conversations durable and resumable. An omitted conversation
identifier creates a conversation; an existing identifier loads its recent
history, composes at most `HISTORY_MESSAGES_THRESHOLD` prior messages (default
12) into structured strategy input, and is returned
with the answer. A `ConversationStore` isolates create, append, and recent
message retrieval from the service. Its SQLite adapter uses the existing
database conventions and persists conversations and messages; the service
reports the actual history count in `metrics.historyMessages`. Inject fake
stores and deterministic strategies for HTTP/service tests, and exercise the
SQLite adapter with an isolated in-memory database.

## Technical Context

**Language/Version**: TypeScript ESM, Node.js 22 LTS, strict mode

**Primary Dependencies**: Express, Zod, native `node:sqlite`,
`@langchain/core` message types and existing strategy interfaces

**Storage**: SQLite via `node:sqlite`, sharing the configured
`OPSPILOT_DB` database file and existing database conventions

**Testing**: `node:test` via `tsx`; in-memory SQLite store tests, fake-store
service/HTTP tests, `npm run typecheck`, and `npm test`

**Target Platform**: Node.js HTTP service

**Project Type**: Express web service

**Performance Goals**: Retrieve at most `HISTORY_MESSAGES_THRESHOLD` prior
messages per request (default 12); no additional latency objective is specified.

**Constraints**: Keep MVC boundaries; validate `conversationId` with Zod at
the HTTP boundary; preserve existing chat behavior and response fields;
configure the history window with `HISTORY_MESSAGES_THRESHOLD` (default 12)
and reject invalid configuration; include only messages from the selected
conversation; surface missing conversation and persistence failures as
errors; do not require a live model or network for tests.

**Scale/Scope**: One existing endpoint, one conversation store interface and
SQLite adapter, conversation/message persistence, bounded prompt history, and
focused store/service/HTTP coverage.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **MVC boundaries**: PASS — request parsing and HTTP response mapping stay in
  the controller; conversation lookup, history composition, and orchestration
  belong in a chat service; SQLite access stays behind the store.
- **External input validation**: PASS — the optional conversation identifier is
  validated with Zod before service execution.
- **Domain errors**: PASS — unknown conversation and persistence failures are
  explicit domain/operational failures and cannot produce success-shaped
  responses.
- **Testing and quality**: PASS — cover SQLite behavior using `:memory:`, inject
  a fake store and deterministic strategy at the service/HTTP seam, and run
  typecheck and the test suite.
- **Security and operations**: PASS — use prepared statements and bound values;
  bound prompt history by a validated configuration value; avoid silent
  replacement of unknown identifiers.
- **Spec-first workflow**: PASS — implementation follows this plan and design
  artifacts, before task generation and implementation.
- **Small, pure, reversible changes**: PASS — reuse the existing Express
  endpoint, strategy contracts, SQLite path configuration, and error mapping.

## Phase 0: Research

See [research.md](./research.md) for decisions on SQLite integration,
conversation/message representation, recent-history ordering, prompt
composition, error semantics, and deterministic testing. No unresolved
technical unknowns remain.

## Phase 1: Design

- [Data model](./data-model.md): conversation, message, recent-history window,
  request, response, and metric constraints.
- [HTTP contract](./contracts/chat-api.yaml): updated `POST /chat` request,
  response, and not-found error schemas.
- [Quickstart](./quickstart.md): offline store/service/HTTP scenarios and
  project validation commands.

### Post-Design Constitution Check

- **MVC boundaries**: PASS — controller validates and maps HTTP; service
  composes conversation context and orchestrates strategies; the store owns
  database access.
- **Validation**: PASS — `conversationId` is optional and type-checked before
  crossing the HTTP boundary.
- **Error handling**: PASS — unknown conversations map to 404; persistence and
  strategy failures do not return a successful chat result.
- **Testability**: PASS — SQLite tests use `:memory:` and orchestration tests
  inject fake stores and deterministic strategies.
- **Security and operations**: PASS — history is scoped by conversation,
  bounded by validated `HISTORY_MESSAGES_THRESHOLD`, and retrieved with bound
  SQL parameters.
- **Scope**: PASS — no authentication, conversation deletion, retention
  policy, or new public endpoint is introduced.

## Project Structure

### Documentation (this feature)

```text
specs/007-persistent-conversations/
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
├── store/
│   ├── conversation-store.ts                 # Store contract and records
│   ├── sqlite-conversation-store.ts          # SQLite persistence and schema
│   └── sqlite-conversation-store.test.ts     # In-memory persistence tests
├── services/
│   ├── chat-service.ts                       # Conversation and strategy flow
│   └── chat-service.test.ts                  # Fake-store history composition
├── controllers/
│   └── chat-controller.ts                    # Validate input/map chat result
├── routes/
│   └── chat-routes.ts                        # Inject production dependencies
├── agents/
│   └── types.ts                              # History and metric typing as needed
└── index.ts                                  # Initialize and close store
```

**Structure Decision**: Extend the existing single Node.js/Express project.
Keep persistence in `src/store`, orchestration in a service, and HTTP-boundary
work in the existing controller and route. Production composition uses the
same SQLite database path as operational data; tests inject either an
in-memory SQLite adapter or a fake conversation store. Reuse strategy result
and error conventions rather than introducing another application or
dependency.

## Complexity Tracking

No constitution violations or additional architectural projects are proposed.
