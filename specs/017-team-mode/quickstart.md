# Quickstart: Team Mode

Runnable validation scenarios that prove the team route works end-to-end. This is a validation/run guide, not an implementation guide; see [data-model.md](./data-model.md) and [contracts/team-route.md](./contracts/team-route.md) for the shapes.

## Prerequisites

- Node.js 22 LTS and dependencies installed at the repository root (`npm install`) and in `web/` (`npm --prefix web install`).
- A configured `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` for live runs. Automated tests use deterministic injected dependencies and do not call the network.

## 1. Static checks (no network)

```powershell
npm run typecheck
npm test
npm --prefix web run typecheck
npm --prefix web run test
```

Expected: all four green. `npm test` includes the new team tests (supervisor decisions, role boundaries, handoff trace, ceiling, authorization, route validation).

## 2. Backend: team route returns a coordinated answer

Run the dev server and send a request that explicitly selects the team route.

```powershell
npm run dev
```

```powershell
curl -s http://localhost:3000/chat -H "Content-Type: application/json" -d '{"userId":"op-1","message":"Investigue os alertas de checkout","strategy":"team"}'
```

Expected:
- HTTP 200 with the standard chat response shape (`answer`, `trace`, `metrics`, `requestId`, `conversationId`).
- `trace` contains at least one `{"type":"handoff","node":"team",...}` event for each control transfer.
- At most eight `handoff` events appear.

## 3. Reject an unknown route

```powershell
curl -s -o NUL -w "%{http_code}" http://localhost:3000/chat -H "Content-Type: application/json" -d '{"userId":"op-1","message":"oi","strategy":"nope"}'
```

Expected: a 4xx validation response (not a team fallback).

## 4. Role boundaries (automated, deterministic)

These are covered by `npm test`; verify by reading the team test cases:

- The Analyst contributes no proposed action and executes nothing.
- The Planner uses zero tools.
- The Executor refuses a mutation when `isMutationAuthorized` is false and performs it only when authorized.
- A run that keeps delegating stops at eight handoffs and is not reported as a fully successful answer.

## 5. Web: handoffs appear in "Ver raciocínio"

```powershell
npm run dev
npm --prefix web run dev
```

In the war room `/chat`, configure the API URL (gear) to the running backend, choose **Rota de raciocínio → Equipe (supervisor + papéis)** (or leave **Automático** to let the router decide), send a message, then open **Ver raciocínio**.

Expected:
- Each `handoff` event is shown, in original order, labeled and listing source, target and brief.
- A trace that also contains other event types keeps ordering and distinguishes the handoff.
- Keyboard-only navigation and dark mode remain usable.

## 6. Base-path deployment (unchanged)

Build the web app and confirm the handoff rendering works under the `/opspilot/` base path.

```powershell
npm run web:build
```

Expected: build succeeds and `web/dist` is produced; the trace panel renders handoffs the same way when served under the base path.

## Success signals

- `npm test` / `npm --prefix web run test` green.
- Explicit `strategy: "team"` selection succeeds; unknown routes are rejected.
- Every control transfer shows as exactly one `handoff` in the response trace and in "Ver raciocínio".
- No mutation occurs without authorization; runs never exceed eight handoffs and never present an incomplete run as success.
