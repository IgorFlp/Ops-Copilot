# Chat API Quickstart

This guide validates `POST /chat` through the real Express route using
deterministic strategy and critic fixtures. Tests must not call a live model,
database, or external network service.

## Prerequisites

- Node.js 22 LTS and the repository dependencies.
- No `.env` values, provider credentials, database, or external service are
  needed for the deterministic integration tests.

## Validation commands

Run the focused HTTP integration tests:

```powershell
node --import tsx --test src/agent/index.test.ts src/controllers/chat-controller.test.ts src/controllers/chat-errors.test.ts src/controllers/chat-reflection.test.ts
```

Run type checking:

```powershell
npm run typecheck
```

Run the complete test suite:

```powershell
npm test
```

## Expected scenarios

1. A valid request with no optional fields runs the `react` fake and returns
   status 200 with `answer`, `trace`, and `metrics`.
2. An explicitly named registered strategy is selected; reflection is applied
   only when `reflect` is true.
3. Missing, whitespace-only, incorrectly typed, or extra body fields return
   status 400 with structured Zod issues and do not run a strategy.
4. A valid unknown strategy name returns 422 and does not run a strategy.
5. A fake strategy exceeding a short injected test deadline returns 504; its
   late completion does not send another response.
6. A fake strategy or reflection failure does not return status 200 or a
   success-shaped body.

The public response and error schemas are defined in
[contracts/chat-api.yaml](./contracts/chat-api.yaml); request and result
entities are summarized in [data-model.md](./data-model.md).
