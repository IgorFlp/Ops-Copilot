# Implementation Plan: Semantic Memory

**Branch**: `[008-semantic-memory]` | **Date**: 2026-11-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/008-semantic-memory/spec.md`

## Summary

Add durable, user-scoped facts to chat. A local sentence-embedding model will
produce normalized vectors; memory operations will detect near-duplicates,
rank recall by dot product, and remove one selected fact. `/chat` will require
`userId` and include up to three qualifying facts in strategy context. Persist
the facts and vectors in the existing SQLite database, with MVC boundaries and
explicit errors.

## Technical Context

**Language/Version**: TypeScript ESM, strict mode; Node.js 22.13+

**Primary Dependencies**: Existing Express, Zod, `node:sqlite`; add
`@huggingface/transformers` for local feature extraction.

**Storage**: Existing SQLite database at the configured OpsPilot database path;
new `memories` table with a Float32 embedding encoded as a BLOB.

**Testing**: `node:test` through `tsx`; deterministic fake embeddings for
service/store tests and a model-backed semantic-recall acceptance test.

**Target Platform**: Node.js server on supported Node 22 platforms; inference
uses the Node CPU backend.

**Project Type**: Express web service with MVC layers and persistent stores.

**Performance Goals**: Meet SC-005: with a warm model and up to 1,000 facts for
one user, 95% of recall requests complete in under one second in the defined
acceptance-test environment.

**Constraints**: Scope every persistence operation by `userId`; reject chat
requests with missing/blank `userId`; use `Xenova/all-MiniLM-L6-v2` with mean
pooling and L2 normalization; compare normalized vectors by dot product; skip
duplicate inserts only above `0.92`; return at most three facts with score
strictly greater than `0.3`; surface storage or embedding failures rather than silently
continuing without memory. Model artifacts may be downloaded on first use and
cached; inference itself is local. Treat recalled facts as untrusted data in a
separately labeled context section, not as instructions. `userId` scoping does
not authenticate the caller; deployment must provide a trusted identity source
outside this feature.

**Scale/Scope**: Initial acceptance target is 1,000 memories per user. No new
public endpoints for memory management or authentication are requested;
remember/recall/forget are application service operations, and `/chat` is the
external interface changed by this feature.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Explicit MVC Layers | Keep persistence/mapping in the SQLite model/store, remember/recall/forget rules in a service, and HTTP validation/orchestration at the controller boundary. | PASS |
| II. Validated External Boundaries | Extend the `/chat` Zod schema to require a non-empty `userId`; do not pass unvalidated request values to services. | PASS |
| III. Domain Errors | Translate missing memories and operational failures through the existing domain-error boundary; do not return success-shaped fallbacks. | PASS |
| IV. Tested Changes | Add `node:test` coverage for persistence, thresholds, isolation, cross-vocabulary recall, and chat context; run typecheck and tests during implementation. | PASS |
| V. Security, Simplicity, and Spec-First | Keep facts and inference local, scope all data access by user, avoid secrets, and make the requested bounded change. | PASS |
| Technical Constraints | Use the existing Node.js SQLite persistence; do not introduce Sequelize or `pg`. | PASS |

No constitution violations or exceptions are required.

## Project Structure

### Documentation (this feature)

```text
specs/008-semantic-memory/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    ├── chat.md
    └── memory-service.md
```

### Source Code (repository root)

```text
src/
├── controllers/
│   ├── chat-controller.ts              # Validate userId and pass it to chat service
│   └── chat-controller.test.ts
├── agents/
│   └── types.ts                         # Add memory context to strategy input formatting
├── memory/
│   ├── embeddings.ts                    # Lazy local embedding pipeline
│   ├── memory-store.ts                  # Lazy default memory-service composition
│   └── semantic-recall.integration.ts    # Explicit model-backed acceptance test
├── models/
│   └── database.ts                      # Reuse existing SQLite connection helpers
├── services/
│   ├── chat-service.ts                  # Recall and attach memory context
│   ├── chat-service.test.ts
│   └── memory-service.ts                # Deduplication, scoring, and scoped forget
└── store/
    ├── sqlite-memory-store.ts           # SQLite persistence and row mapping
    └── sqlite-memory-store.test.ts
```

**Structure Decision**: Extend the existing single-project MVC structure.
`src/services/memory-service.ts` owns memory rules, while
`src/store/sqlite-memory-store.ts` owns persistence. The specifically requested
`src/memory/memory-store.ts` provides the lazy default composition used by chat;
`src/memory/embeddings.ts` owns the independently lazy embedding pipeline.
Update shutdown wiring to close the default memory store.

## Phase 0: Outline & Research

Resolved choices are documented in [research.md](./research.md). There are no
unresolved technical-context clarifications.

## Phase 1: Design & Contracts

- [data-model.md](./data-model.md) defines the memory row and vector rules.
- [contracts/chat.md](./contracts/chat.md) documents the changed HTTP request
  and existing response behavior.
- [contracts/memory-service.md](./contracts/memory-service.md) documents the
  internal remember/recall/forget operations; it does not add public routes.
- [quickstart.md](./quickstart.md) defines runnable validation scenarios.

### Constitution Check (Post-Design)

The design keeps HTTP concerns in the controller, domain rules in the memory
service, and SQLite mapping in the store. User input is Zod-validated; all
queries and deletes are user-scoped; failures remain explicit; tests use the
repository's required runner. No new persistence technology or external
inference service is introduced. **PASS**.
