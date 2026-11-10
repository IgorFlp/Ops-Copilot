# Implementation Plan: Persisted Trace and JSON Logs

**Branch**: `015-persisted-trace-json-logs` | **Date**: 2026-11-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-persisted-trace-json-logs/spec.md`

## Summary

Add end-to-end request observability to the chat flow: every accepted chat request receives a stable `requestId` that is echoed in the response body and the `X-Request-Id` header; the request record (outcome and metrics) and each trace event (node, type, payload, order) are persisted transactionally in the existing SQLite operational database (`request` and `trace_events`); all operational events are emitted through a new `src/obs/logger.ts` as one JSON line per event with metadata only; and `GET /requests/:id` returns the persisted record with its trace in original order. Implementation follows the existing model/store → service → controller → route layering and uses no new dependencies.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, NodeNext) on Node.js >= 22.13 LTS

**Primary Dependencies**: Express, Zod, `node:sqlite`, `node:crypto`, existing LangChain/LangGraph stack; no new runtime dependencies

**Storage**: SQLite via the native `node:sqlite` module, using the shared database opened by `src/models/database.ts`; new tables `request` and `trace_events`

**Testing**: `node:test` executed through `tsx` (`npm test`), plus `tsc --noEmit` (`npm run typecheck`)

**Target Platform**: Node.js server (single process; Windows development, Linux production)

**Project Type**: Single-project web service with an accompanying CLI

**Performance Goals**: Persistence completes within the chat request lifecycle; `GET /requests/:id` responds in under 1 second; 20 concurrent chat requests remain correctly correlated

**Constraints**: Local SQLite only; one JSON object per log line written to the existing stderr destination; logs contain metadata only; no secrets or conversation content in logs; no new dependencies; no `dotenv`

**Scale/Scope**: Local single-node deployment; tens of trace events per chat request; sequential feature numbering `015`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Explicit MVC Layers**: PASS — persistence lives in a store (model layer), orchestration in a service, HTTP translation in a controller, and wiring in a route. Services do not depend on Express.
- **II. Validated External Boundaries**: PASS — the existing chat body is validated with Zod; the new `:id` path parameter is validated at the controller boundary before reaching the service.
- **III. Domain Errors**: PASS — unknown request identifiers surface as `DomainError("...", "NOT_FOUND")`; persistence failures surface explicitly as `DomainError(..., "INTERNAL")` and are translated at the edge.
- **IV. Tested Changes**: PASS — unit and HTTP tests will use `node:test` via `tsx`; `npm run typecheck` and `npm test` must pass before completion.
- **V. Security, Simplicity, and Spec-First Development**: PASS — no secrets are logged or versioned; failures are explicit; changes are small and layered; this plan follows the spec-first workflow.
- **Technical Constraints**: PASS — SQLite through `node:sqlite`, Zod validation, Express, Node.js 22, no Sequelize/`pg`/`dotenv`.

**Result**: No violations; no complexity exceptions required.

**Post-Design Re-evaluation (after Phase 1)**: PASS — the design keeps persistence in a store, orchestration in services, and HTTP/header handling in controllers; Zod validates the retrieval boundary; unknown identifiers use `NOT_FOUND`; persistence failures are explicit; logging centralizes metadata-only emission. No new dependencies were introduced, so the technical constraints continue to hold.

## Project Structure

### Documentation (this feature)

```text
specs/015-persisted-trace-json-logs/
├── plan.md              # This file
├── research.md          # Phase 0 decisions
├── data-model.md        # Phase 1 persistence model
├── quickstart.md        # Phase 1 validation guide
├── contracts/
│   ├── http-api.md      # POST /chat and GET /requests/:id contract
│   └── log-line.md      # Structured log line contract
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── spec.md              # Feature specification
```

### Source Code (repository root)

```text
src/
├── obs/
│   ├── logger.ts                  # NEW: single-line JSON metadata logger
│   └── logger.test.ts             # NEW: JSON line and metadata-only tests
├── controllers/
│   ├── chat-controller.ts         # MODIFIED: requestId generation, header, persistence orchestration
│   ├── chat-controller.test.ts    # MODIFIED: requestId/header/persistence assertions
│   ├── chat-errors.test.ts        # MODIFIED: failure persistence/header assertions
│   ├── request-controller.ts      # NEW: GET /requests/:id
│   └── request-controller.test.ts # NEW
├── routes/
│   ├── chat-routes.ts             # MODIFIED: pass request-trace service
│   ├── request-routes.ts          # NEW
│   └── request-routes.test.ts     # NEW (or covered by controller tests)
├── services/
│   ├── chat-service.ts            # MODIFIED: accept requestId and include it in logs
│   ├── chat-service.test.ts       # MODIFIED: requestId in service input
│   ├── request-trace-service.ts   # NEW: record and retrieve request traces
│   └── request-trace-service.test.ts # NEW
├── store/
│   ├── request-store.ts           # NEW: store interface and domain records
│   ├── sqlite-request-store.ts    # NEW: SQLite implementation
│   ├── sqlite-request-store.test.ts # NEW
│   ├── default-request-store.ts   # NEW: process-wide default store
│   └── ...
├── lib/
│   └── log.ts                     # MODIFIED: delegate logEvent to obs/logger
├── app.ts                         # MODIFIED: register request router
├── index.ts                       # MODIFIED: close default request store on shutdown
└── middleware/error-handler.ts    # UNCHANGED behavior; uses JSON logger via lib/log

data/
└── opspilot.db                    # Existing SQLite database (runtime)
```

**Structure Decision**: Single-project layout consistent with the existing repository. Data access is added as a new store in `src/store`, domain orchestration in `src/services`, HTTP boundaries in `src/controllers` and `src/routes`, and logging infrastructure in the new `src/obs` directory requested by the feature.

## Complexity Tracking

No constitution violations or justified complexity exceptions.
