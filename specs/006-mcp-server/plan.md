# Implementation Plan: OpsPilot MCP Server

**Branch**: `main` | **Date**: 2026-11-03 | **Spec**:
[spec.md](./spec.md)

**Input**: Feature specification from
`specs/006-mcp-server/spec.md`

## Summary

Provide a local MCP stdio interface named `opspilot` with the requested
`list_alerts`, `open_incidents`, and `resolve_incident` tools. Implement the
server as an adapter over the existing incident service and default operational
store. Extract the relevant Zod definitions to a shared schema module so the
existing LangChain tools and MCP registration use one source of truth. Keep
protocol messages on stdout and diagnostics on stderr. Details and decisions
are recorded in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript ESM, strict mode; Node.js 22.13 or later

**Primary Dependencies**: `@modelcontextprotocol/sdk` stable v1 API (official
documentation version 1.32.2); existing Zod 4.6.7, `tsx`, and incident-service
modules

**Storage**: Existing SQLite-backed `OpsStore`; no schema or migration changes

**Testing**: `node:test` via `tsx`; in-memory store tests and MCP stdio
integration tests; `npm run typecheck`

**Target Platform**: Node.js process spawned by a local MCP client over stdio

**Project Type**: Node.js application with HTTP, CLI, and MCP interfaces

**Performance Goals**: No latency target is specified. Tool calls use local
SQLite-backed operations and add no external service requests.

**Constraints**: Stdio stdout is reserved for MCP protocol messages;
diagnostics go to stderr and the server must not call `console.log`. Validate
inputs with shared Zod definitions. Reuse the same default store and domain
service. Register only the three requested MCP tools. Add the npm script
`mcp: tsx src/mcp/server.ts`; do not load `.env` unless required by the store.

**Scale/Scope**: One local MCP server process, one shared operational store,
three tools, no new persisted entities or transport endpoints.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Assessment |
|---|---|---|
| I. Explicit MVC layers | Keep domain operations in services; transport adapter must not access SQLite or embed business rules. | **PASS** — MCP boundary delegates to `createIncidentService`; no new persistence layer. |
| II. Validated External Boundaries | Validate all MCP arguments with Zod before service calls. | **PASS** — shared Zod definitions feed both current tools and MCP registration. |
| III. Domain Errors | Translate predictable errors at the external boundary and do not expose internal details. | **PASS** — MCP tool errors carry concise client-safe messages; diagnostic details remain on stderr. |
| IV. Tested Changes | Add `node:test` coverage and run typecheck and tests. | **PASS** — test plan covers schema behavior, tool calls, shared state, and stdio output. |
| V. Security, Simplicity, and Spec-First Development | Keep state shared, avoid secrets and `.env` loading, preserve explicit failures, follow the feature workflow. | **PASS** — reuses default store; no credentials or new environment loading are required. |

No pre-research gate violations identified.

## Project Structure

### Documentation (this feature)

```text
specs/006-mcp-server/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── mcp-tools.md
└── tasks.md                 # Created by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── tool-schemas.ts      # Shared Zod input definitions for existing and MCP tools
│   ├── tools.ts             # Existing LangChain tools consume the shared schemas
│   └── tools.test.ts        # Existing tool behavior remains covered
├── mcp/
│   ├── server.ts            # MCP registration, stdio startup, error/log boundary, shutdown
│   └── server.test.ts       # MCP protocol and operational integration tests
├── services/
│   └── incident-service.ts  # Existing domain operations reused unchanged
└── store/
    └── default-ops-store.ts # Existing shared store lifecycle reused

package.json                 # Add `mcp` run script and SDK dependency
package-lock.json            # Lock the SDK dependency
```

**Structure Decision**: Keep the MCP implementation under `src/mcp` as a
transport adapter. Place shared tool schemas with the existing agent-tool
definitions and leave domain, persistence, HTTP, and CLI layers in their
current locations. Tests follow the repository's colocated `src/**/*.test.ts`
pattern.

## Phase 0: Research

Completed in [research.md](./research.md). Research selected the stable SDK v1
stdio API, established Zod v4 compatibility, documented `isError` result
semantics, and resolved shared-schema, service reuse, and test choices. No
unresolved technical-context clarifications remain.

## Phase 1: Design

- [Data model](./data-model.md): defines session, existing records, shared
  store behavior, and state lifecycle.
- [MCP tool contract](./contracts/mcp-tools.md): records tool names, inputs,
  defaults, success format, errors, and stdio requirements.
- [Quickstart](./quickstart.md): gives automated and manual validation paths.

### Post-Design Constitution Check

| Principle | Assessment after design |
|---|---|
| I. Explicit MVC layers | **PASS** — transport adapter delegates to the existing service and store interface; no direct persistence logic is added. |
| II. Validated External Boundaries | **PASS** — MCP SDK registers the shared Zod field shapes, and both interfaces use the same schema definitions. |
| III. Domain Errors | **PASS** — tool errors are explicit, concise, and client-safe; diagnostics stay on stderr. |
| IV. Tested Changes | **PASS** — design includes deterministic in-memory and stdio integration validation plus the required typecheck. |
| V. Security, Simplicity, and Spec-First Development | **PASS** — no new state source, secrets, environment loader, or unrelated abstractions are introduced. |

No design-stage constitution violations or complexity justifications are
required.

## Complexity Tracking

No constitution violations.
