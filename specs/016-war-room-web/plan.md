# Implementation Plan: War Room Web

**Branch**: `016-war-room-web` | **Date**: 2026-11-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-war-room-web/spec.md`

## Summary

Build a new Vite + React + TypeScript war room client under `web/`, served at the `/opspilot/` base path, that lets an on-call operator chat with the copilot, inspect the typed reasoning trace through "Ver raciocínio", and decide pending approvals through an approve/deny card when the API accepts a request as pending (202). The client reads its API base URL from a settings gear, persists it locally, and follows the project design instructions (hierarchy, 4px spacing scale, empty/error states, dark mode, accessibility). The backend gains a small, dependency-free CORS middleware so the browser can call the API cross-origin, and the built client is served by Express under `/opspilot/` with SPA fallback. The 202 approval contract is defined here and consumed by the client; the API's emission of 202 and its decision endpoint are recorded as an explicit dependency.

## Technical Context

**Language/Version**: TypeScript 5.x in `strict` mode; React 19; Vite 7; Node.js >= 22.13 for tooling

**Primary Dependencies**: `react`, `react-dom`, `react-router-dom`, `zod` (response validation), `vite`, `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`; no UI component library and no CSS framework

**Storage**: Browser `localStorage` for the API base URL and theme preference; no new server-side storage

**Testing**: Vitest + Testing Library + jsdom with deterministic `fetch` fixtures; `tsc --noEmit` for typecheck; backend CORS covered by `node:test` via `tsx`

**Target Platform**: Modern evergreen browsers; client served under `/opspilot/`; API on the existing Node.js/Express server

**Project Type**: Web application (new `web/` frontend) plus a small backend middleware change

**Performance Goals**: Initial client load under 2 seconds on a local network; chat answer rendered as soon as the response arrives; trace panel opens under 100 ms; no layout shift when states change

**Constraints**: Base path `/opspilot/`; cross-origin API access; no secrets in the client; WCAG AA and dark mode per design instructions; no new backend runtime dependencies; backend remains Node.js/TypeScript/Express/SQLite

**Scale/Scope**: One operator session at a time; conversations of hundreds of messages; traces of hundreds of events; a single chat screen plus settings and trace/approval surfaces

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Explicit MVC Layers**: PASS — the backend change is a middleware (CORS) and does not move logic across layers. The web client is a separate consumer with its own layers: API client, hooks/state, components, and pages. The constitution governs the HTTP application; the client does not bypass it.
- **II. Validated External Boundaries**: PASS — the client validates the API base URL and the message before sending, and validates API responses with Zod before rendering. The backend CORS allowlist is read and validated from the environment.
- **III. Domain Errors**: PASS — API failures are mapped to typed client errors and distinct user-facing states; internal details are never shown to the operator.
- **IV. Tested Changes**: PASS — client behavior is covered with Vitest and Testing Library; the CORS middleware is covered with `node:test`; `npm run typecheck` and `npm test` must pass in both the root and `web/` packages.
- **V. Security, Simplicity, and Spec-First Development**: PASS — no secrets are stored or logged; the API URL is configuration, not a credential; failures are explicit; the client is small and layered; this plan follows the spec-first workflow.
- **Technical Constraints**: PASS — the backend keeps Node.js 22, TypeScript ESM strict, Zod, Express, and SQLite; CORS is implemented without a new dependency; the frontend is additive and does not alter persistence.

**Result**: No violations; no complexity exceptions required.

**Post-Design Re-evaluation (after Phase 1)**: PASS — the design keeps the backend change to a single middleware, validates the client's external boundaries with Zod, maps failures to explicit states, and adds no backend dependency. The client's base path, routing, and API configuration are isolated in small modules. No constitution principle is weakened.

## Project Structure

### Documentation (this feature)

```text
specs/016-war-room-web/
├── plan.md              # This file
├── research.md          # Phase 0 decisions
├── data-model.md        # Phase 1 client data model and state transitions
├── quickstart.md        # Phase 1 validation guide
├── contracts/
│   ├── http-api.md      # Chat, pending approval, decision, and CORS contract
│   └── ui-contract.md   # Routes, components, states, and accessibility contract
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── spec.md              # Feature specification
```

### Source Code (repository root)

```text
web/
├── package.json                     # NEW: web package scripts and dependencies
├── tsconfig.json                    # NEW: strict client TypeScript config
├── tsconfig.node.json               # NEW: Vite config TypeScript config
├── vite.config.ts                   # NEW: base '/opspilot/', test config
├── index.html                       # NEW: Vite entry
├── .env.example                     # NEW: VITE_API_BASE_URL default
├── AGENTS.md                        # EXISTING: design instructions for web/**
├── src/
│   ├── main.tsx                     # NEW: React root
│   ├── App.tsx                      # NEW: providers and router
│   ├── router.tsx                   # NEW: routes with basename
│   ├── pages/
│   │   ├── ChatPage.tsx             # NEW: chat screen at /chat
│   │   └── NotFoundPage.tsx         # NEW: not-found state
│   ├── components/
│   │   ├── layout/AppShell.tsx      # NEW: header, settings trigger, theme
│   │   ├── chat/                    # NEW: composer, message list, metrics
│   │   ├── trace/TracePanel.tsx     # NEW: typed trace rendering
│   │   ├── approval/ApprovalCard.tsx# NEW: approve/deny card
│   │   ├── settings/SettingsPanel.tsx # NEW: API URL gear
│   │   └── ui/                      # NEW: buttons, fields, states, icons
│   ├── hooks/
│   │   ├── useChat.ts               # NEW: chat request lifecycle
│   │   ├── useApiConfig.ts          # NEW: API URL load/save/validate
│   │   └── useTheme.ts              # NEW: system/light/dark preference
│   ├── lib/
│   │   ├── api-client.ts            # NEW: fetch wrapper and error mapping
│   │   ├── config.ts                # NEW: base path and default API URL
│   │   ├── storage.ts               # NEW: versioned localStorage helpers
│   │   └── errors.ts                # NEW: typed client errors
│   ├── types/
│   │   ├── chat.ts                  # NEW: chat request/response types
│   │   ├── trace.ts                 # NEW: typed trace union
│   │   └── approval.ts              # NEW: pending approval and decision types
│   ├── styles/
│   │   ├── tokens.css               # NEW: color, spacing, typography tokens
│   │   ├── themes.css               # NEW: light and dark token values
│   │   └── global.css               # NEW: reset and base styles
│   └── test/
│       ├── setup.ts                 # NEW: Testing Library setup
│       └── fixtures/                # NEW: deterministic API fixtures
└── tests/                           # NEW: colocated or grouped client tests

src/
├── middleware/
│   ├── cors.ts                      # NEW: dependency-free CORS middleware
│   └── cors.test.ts                 # NEW: allowlist and preflight tests
├── app.ts                           # MODIFIED: register CORS and static SPA serving
└── index.ts                         # UNCHANGED behavior

package.json                         # MODIFIED: add web scripts (dev/build/test)
.gitignore                           # MODIFIED: ignore web/node_modules and web/dist
```

**Structure Decision**: The client is a self-contained package under `web/` with its own `package.json`, TypeScript config, and Vite build, matching the requested stack and the `web/**` design instructions. The backend change is limited to a new middleware and static serving of the built client under `/opspilot/`. The root package gains convenience scripts that delegate to `web/`.

## Complexity Tracking

No constitution violations or justified complexity exceptions.
