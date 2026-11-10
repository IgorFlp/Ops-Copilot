# Phase 0 Research: War Room Web

**Feature**: `016-war-room-web` | **Date**: 2026-11-10

All unknowns from the Technical Context are resolved below. No `NEEDS CLARIFICATION` markers remain.

## Decision 1: Build tool and UI framework

- **Decision**: Vite + React + TypeScript, as explicitly requested.
- **Rationale**: Vite gives a fast dev server, native TypeScript support, and a simple static build that can be served under a base path. React is the requested framework and has a mature testing story.
- **Alternatives considered**: Next.js (server rendering is unnecessary for an internal war room and adds a server runtime), Create React App (deprecated), plain TypeScript + DOM (more code for the same result).

## Decision 2: Routing and base path

- **Decision**: Set Vite `base: "/opspilot/"` and configure React Router with `basename={import.meta.env.BASE_URL}`. Routes: `/` redirects to `/chat`, `/chat` is the chat screen, and an unknown route renders a not-found page.
- **Rationale**: A single source of truth for the base path keeps asset URLs and client routes consistent. `import.meta.env.BASE_URL` is derived from the Vite base, so the two cannot drift.
- **Alternatives considered**: Hash routing (avoids server fallback but produces ugly URLs and breaks deep-link expectations), hardcoding `/opspilot/` in every link (error-prone).

## Decision 3: Styling and design tokens

- **Decision**: Plain CSS with CSS custom properties for design tokens, plus CSS Modules for component-scoped styles. No UI component library and no CSS framework.
- **Rationale**: The design instructions require a controlled 4px spacing scale, semantic color tokens, dark mode, and WCAG AA contrast. Owning the tokens avoids fighting a third-party theme and keeps the dependency surface small.
- **Alternatives considered**: Tailwind (fast but adds a build-time dependency and encourages arbitrary values), MUI/Chakra (large dependency and opinionated visuals that would need overriding), styled-components (runtime cost and another dependency).

## Decision 4: Client state management

- **Decision**: React hooks plus two small contexts: `ApiConfigProvider` and `ThemeProvider`. Chat state lives in `useChat`; no global store.
- **Rationale**: The app has one main screen and a few cross-cutting preferences. Contexts are sufficient and keep the code easy to test.
- **Alternatives considered**: Redux Toolkit (overkill), Zustand (extra dependency for little benefit at this size), URL state for everything (poor fit for transient request state).

## Decision 5: API client and response validation

- **Decision**: A small `fetch` wrapper in `lib/api-client.ts` that builds URLs from the configured base URL, sends JSON, maps HTTP status codes to typed errors, and validates successful payloads with Zod schemas.
- **Rationale**: Validating responses at the boundary matches the constitution's "validated external boundaries" principle and prevents malformed payloads from reaching components. A wrapper centralizes timeout, error mapping, and the `X-Request-Id` header.
- **Alternatives considered**: `axios` (extra dependency), generated OpenAPI client (no OpenAPI document exists), trusting `response.json()` (unsafe at the boundary).

## Decision 6: Pending approval (202) contract

- **Decision**: Define the contract in `contracts/http-api.md`:
  - `POST /chat` returns `202 Accepted` with `{ status: "pending_approval", requestId, conversationId, approval: { approvalId, requestId, action: { tool, summary, args }, expiresAt? } }`.
  - `POST /approvals/:approvalId/decision` accepts `{ decision: "approve" | "deny", userId }` and returns `{ approvalId, status: "approved" | "denied", requestId, result? }`.
  - The client renders the approve/deny card from the 202 payload and submits the decision to the decision endpoint.
- **Rationale**: The spec requires the client to turn a pending acceptance into an actionable card. An explicit contract lets the client be built and tested against deterministic fixtures while the API's 202 emission is delivered as a dependency.
- **Alternatives considered**: Polling a status endpoint (more moving parts and latency), WebSockets/SSE (unnecessary for a single decision), embedding the decision URL in the 202 payload (less predictable than a documented route).
- **Dependency note**: The current API does not emit 202 or expose a decision endpoint. This feature defines and consumes the contract; the API-side emission and decision handling are tracked as a dependency and must be implemented before the card can appear in production. The client is fully testable with fixtures.

## Decision 7: Testing strategy

- **Decision**: Vitest + Testing Library + jsdom, with a deterministic `fetch` mock and fixtures for 200, 202, and error responses. Backend CORS is tested with `node:test` via `tsx`.
- **Rationale**: Vitest is Vite-native and fast; Testing Library exercises the UI the way an operator does. Deterministic fixtures keep tests offline and stable.
- **Alternatives considered**: Jest (extra configuration with Vite), Playwright (valuable for end-to-end but heavier; can be added later), manual testing only (not acceptable under the constitution).

## Decision 8: CORS support

- **Decision**: Add a dependency-free Express middleware in `src/middleware/cors.ts`. It reads `CORS_ALLOWED_ORIGINS` (comma-separated), allows same-origin requests, answers `OPTIONS` preflight with the allowed methods and headers, and sets `Access-Control-Allow-Origin` only for allowlisted origins.
- **Rationale**: The browser must call the API cross-origin. Implementing the middleware directly avoids a new backend dependency and keeps the allowlist explicit and testable.
- **Alternatives considered**: The `cors` package (new dependency), a Vite dev proxy only (does not solve production cross-origin), wildcard `*` (too permissive and incompatible with credentials).

## Decision 9: Settings persistence

- **Decision**: Persist the API base URL and theme preference in `localStorage` under versioned keys (`opspilot.apiBaseUrl.v1`, `opspilot.theme.v1`). Normalize the URL by trimming and removing a trailing slash. Validate with `new URL()` and require `http:` or `https:`.
- **Rationale**: Settings must survive reloads and be easy to reset. Versioned keys allow future migrations without breaking stored values.
- **Alternatives considered**: Cookies (sent to the server unnecessarily), server-side configuration (requires a backend change and does not let the operator switch environments), session storage (lost on reload).

## Decision 10: Theme handling

- **Decision**: Default to `prefers-color-scheme`, allow an explicit light/dark override, and persist the override. Apply the resolved theme through a `data-theme` attribute on the root element.
- **Rationale**: Matches the design instructions: respect the system preference, allow manual override, and avoid automatic color inversion.
- **Alternatives considered**: System-only (no operator control), light-only (fails the dark-mode requirement).

## Decision 11: Typed trace rendering

- **Decision**: Model trace events as a discriminated union keyed by `type` (`thought`, `action`, `observation`, `plan`, `critique`, `answer`, `summarize`, `route`, `context`, `fallback`). Render each type with a label and its structured fields (`node`, `timestamp`, `tools`, `args`, `approved`). Unknown types fall back to a raw-content renderer.
- **Rationale**: The spec requires a typed trace that never drops events. A discriminated union gives exhaustive rendering and a safe fallback.
- **Alternatives considered**: Rendering all events as plain text (loses structure), a generic JSON viewer (poor readability for operators).

## Decision 12: Serving the built client under `/opspilot/`

- **Decision**: In production, Express serves `web/dist` at `/opspilot` with a SPA fallback to `index.html` for non-API paths. In development, the Vite dev server runs with `base: "/opspilot/"` and proxies or calls the API directly.
- **Rationale**: A single Node process can host both the API and the war room, and the SPA fallback makes deep links and refreshes work. The Vite base keeps development and production consistent.
- **Alternatives considered**: Separate static hosting (valid, but requires external configuration), hash routing (avoids fallback but degrades URLs), no fallback (breaks refresh on `/opspilot/chat`).

## Decision 13: Error and empty states

- **Decision**: Map API outcomes to explicit states: loading, empty, validation (400), unsupported strategy (422), not found (404), timeout (504), model unavailable (503), internal (500), and connectivity failure. Each state has a message and, where useful, a retry action.
- **Rationale**: The spec and design instructions require distinct, understandable states and forbid presenting failures as success.
- **Alternatives considered**: A single generic error toast (loses actionable detail), silent retries (hides failures from the operator).
