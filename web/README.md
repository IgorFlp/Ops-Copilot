# OpsCopilot War Room (web)

Web client for the OpsCopilot war room: chat with the copilot, inspect the
typed reasoning trace, and decide pending approvals.

Built with Vite + React + TypeScript. Styling follows the project design
instructions (`../.github/instructions/design.instruction.md`, mirrored in
`AGENTS.md`): semantic tokens, the 4px spacing scale, explicit empty/error
states, dark mode, and WCAG AA accessibility.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Vite dev server at `http://localhost:5173/opspilot/` |
| `npm run build` | Typecheck and build to `web/dist` |
| `npm run preview` | Preview the production build |
| `npm test` | Vitest + Testing Library |
| `npm run typecheck` | `tsc --noEmit` |

From the repository root you can use `npm run web:dev`, `npm run web:build`,
`npm run web:test`, and `npm run web:typecheck`.

## Base path

The client is served under `/opspilot/`. Vite uses `base: "/opspilot/"` and the
router uses `import.meta.env.BASE_URL` as its basename, so assets, routes, and
deep links (including refresh on `/opspilot/chat`) resolve correctly.

## API URL configuration

The API base URL is set from the settings gear and persisted in `localStorage`
under `opspilot.apiBaseUrl.v1`. The default comes from `VITE_API_BASE_URL` (see
`.env.example`) or, when unset, the current origin. Values must be absolute
`http:`/`https:` URLs.

Copy `.env.example` to `.env` to change the default and the operator identity.

## Deployment

In production the built client is served by the Express API under `/opspilot`
with an SPA fallback (see `../src/middleware/web-static.ts`). Build the client
first, then start the server:

```powershell
npm run web:build
npm run dev
```

The API must allow the war room origin via `CORS_ALLOWED_ORIGINS`
(comma-separated). See `../src/middleware/cors.ts`.

## Pending approvals (202)

When `POST /chat` returns `202 Accepted`, the client renders an approve/deny
card and submits the decision to `POST /approvals/:approvalId/decision`. The
contract is documented in
`../specs/016-war-room-web/contracts/http-api.md`.

The API currently does not emit `202` or expose the decision endpoint; the
client is built against the documented contract and tested with deterministic
fixtures. Approvals appear in production once the API side lands.
