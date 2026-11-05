# Context Token Metrics Quickstart

This guide validates character-based context estimates, actual prompt-usage
propagation, and the per-turn display without requiring a live model provider.

## Prerequisites

- Node.js 22.13+ and the repository dependencies.
- Bash and `jq` to run `scripts/conversa-longa.sh`.
- No `.env` values, provider credentials, or external database are required
  for deterministic tests.

## Focused validation

Run the relevant deterministic tests:

```powershell
node --import tsx --test src/context/tokens.test.ts src/agents/model-usage.test.ts src/agents/react.test.ts src/agents/plan-and-execute.test.ts src/agents/reflection.test.ts src/services/chat-service.test.ts src/services/arena-service.test.ts src/controllers/chat-controller.test.ts scripts/conversa-longa.test.ts
```

Run type checking and the complete suite:

```powershell
npm run typecheck
npm test
```

## End-to-end scenario

Run the long-conversation exercise against the local application with
deterministic provider fixtures or a controlled test server. Each successful
turn must print that response's actual `metrics.promptTokens` value, or an
explicit unavailable marker. Estimated request/response sizes remain labeled
as estimates and are not used as the actual prompt-token value.

The response schema is in [contracts/chat-api.yaml](./contracts/chat-api.yaml)
and metric definitions are in [data-model.md](./data-model.md).

## Expected checks

1. Token estimates count Unicode code points and round down independently for
   each included input source.
2. `metrics.contextBreakdown` distinguishes the current request, included
   history, and included recalled memories.
3. `metrics.promptTokens` equals the sum of usage reported for all model calls
   in the run, including retries, tool cycles, and reflection when applicable.
4. If any call does not report valid prompt usage, `promptTokens` is absent;
   the API does not emit a partial total or substitute an estimate.
5. Existing answer, trace, call-count, and latency behavior remains unchanged.
