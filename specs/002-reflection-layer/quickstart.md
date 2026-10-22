# Reflection Layer Quickstart

This guide validates the reflection wrapper and arena integration without
calling a live model. Use injected deterministic strategy and critic fixtures
for unit and HTTP controller/service scenarios.

## Prerequisites

- Node.js 22 LTS and the repository's installed dependencies.
- No API key or database is required for the deterministic reflection tests.
- Do not read or print `.env` values while preparing the test environment.

## Validation commands

Run targeted reflection and arena tests:

```powershell
node --import tsx --test src/agents/reflection.test.ts src/agents/react.test.ts src/agents/plan-and-execute.test.ts src/agents/tools.test.ts src/services/arena-service.test.ts src/controllers/arena-controller.test.ts src/arena-cli.test.ts
```

Run the project type check:

```powershell
npm run typecheck
```

Run the complete test suite:

```powershell
npm test
```

## Expected scenarios

1. **Approved initial answer**: one strategy run and one critic decision return
   the initial answer, with one critique trace event and both calls included in
   metrics.
2. **Rejected answer and approval after retry**: critique feedback is present
   in the next strategy context; observations from earlier attempts remain
   available; trace events remain chronological.
3. **Default limit exhausted**: with two rejected critiques, the wrapped
   strategy regenerates twice; the second regeneration is returned without a
   third critique.
4. **Zero and invalid limits**: zero permits an initial critique but no
   regeneration; negative, fractional, or values above 100 fail before a
   strategy or critic is invoked.
5. **Metrics and failure propagation**: each base-model and critic call is
   counted, total latency covers all attempts, and malformed critic output or
   any failed stage rejects the run.
6. **Mutation safety**: when a first attempt records a completed
   state-changing action, a retry retains its observation and does not execute
   that action a second time.
7. **Arena variants**: `reflect:react` and `reflect:plan-and-execute` can each
   be selected through HTTP and CLI, both can be selected together, the
   `--max-reflection` CLI flag accepts the range 0–100, and omission of
   `strategies` continues to run only the two existing unreflected strategies.

## HTTP contract

The request and result shapes, including the `maxReflection` bounds and
`approved` critique trace field, are defined in
[contracts/arena-api.yaml](./contracts/arena-api.yaml).
