# Quickstart: War Room Web

**Feature**: `016-war-room-web` | **Date**: 2026-11-10

Validation guide for the war room client. It proves the feature end-to-end without duplicating the contracts or data model.

## Prerequisites

- Node.js >= 22.13
- The API running locally (`npm run dev` in the repository root)
- `CORS_ALLOWED_ORIGINS` set to the war room dev origin (for example `http://localhost:5173`)

## Setup

```powershell
# From the repository root
npm install
npm --prefix web install
```

## Run

```powershell
# Terminal 1: API
npm run dev

# Terminal 2: war room (Vite dev server, base /opspilot/)
npm run web:dev
```

Open `http://localhost:5173/opspilot/` and confirm it redirects to `/opspilot/chat`.

## Build and serve from Express

```powershell
npm run web:build
npm run dev
```

Open `http://localhost:3000/opspilot/` and confirm the built client is served with SPA fallback.

## Automated checks

```powershell
# Client
npm --prefix web run typecheck
npm --prefix web test

# Backend (CORS middleware)
npm run typecheck
npm test
```

## Validation scenarios

### 1. Chat with the copilot

1. Open `/opspilot/chat`.
2. Type a message and press `Enter`.
3. Confirm the user message appears, a loading state is shown, and the assistant answer appears with metrics and a request identifier.
4. Send a follow-up and confirm the conversation continues.

Expected: the answer, metrics, and request id are visible; the composer is disabled only while a request is in flight.

### 2. Typed reasoning trace

1. Produce a response that includes a trace.
2. Select "Ver raciocínio".
3. Confirm the panel lists events in order with type labels and structured details (node, timestamp, tools, arguments, approval status).
4. Confirm an unknown event type still renders its raw content.
5. Close the panel with `Escape` and reopen it.

Expected: no event is dropped; the conversation is unchanged after closing.

### 3. Pending approval (202)

Use a deterministic fixture or a test API that returns `202` with the contract in `contracts/http-api.md`.

1. Send a message that produces a pending approval.
2. Confirm the approve/deny card appears with the proposed action.
3. Select "Aprovar" and confirm the card shows the approved outcome.
4. Repeat with "Negar" and confirm the denied outcome.
5. Simulate a decision failure and confirm the card remains actionable with a retry.

Expected: duplicate submissions are prevented; failures never appear as success.

### 4. API URL settings

1. Open the settings gear.
2. Enter a valid API base URL and save.
3. Send a message and confirm the request goes to the configured URL.
4. Reload the page and confirm the URL is restored.
5. Enter an invalid or empty URL and confirm it is rejected while the previous value is kept.

Expected: the setting persists across reloads and invalid values never replace a valid one.

### 5. Base path and deep links

1. Open `/opspilot/chat` directly.
2. Refresh the page.
3. Confirm the chat screen loads with all assets resolved.
4. Open an unknown path under `/opspilot/` and confirm the not-found state with a link back to chat.

Expected: no broken assets and no blank page.

### 6. Cross-origin access

1. Run the client on a different origin from the API.
2. Confirm the browser preflight succeeds and the chat request completes.
3. Remove the client origin from `CORS_ALLOWED_ORIGINS` and confirm the client shows a connectivity error instead of a silent failure.

Expected: allowlisted origins work; non-allowlisted origins are rejected and surfaced clearly.

### 7. Error states

Exercise each API outcome: `400`, `404`, `422`, `500`, `503`, `504`, and a network failure.

Expected: each outcome shows a distinct, understandable state with a retry or recovery action; none is presented as a successful answer.

### 8. Accessibility and dark mode

1. Complete the primary flows using only the keyboard.
2. Confirm focus is always visible and the order is logical.
3. Switch the theme to dark and confirm contrast and readability.
4. Enable `prefers-reduced-motion` and confirm animations are reduced.
5. Zoom to 200% and confirm no content is lost.

Expected: all flows remain usable and meet the design instructions.

## References

- API contract: [contracts/http-api.md](./contracts/http-api.md)
- UI contract: [contracts/ui-contract.md](./contracts/ui-contract.md)
- Data model: [data-model.md](./data-model.md)
- Design instructions: `.github/instructions/design.instruction.md` and `web/AGENTS.md`
