# Learning Reflector Quickstart

## Prerequisites

- Node.js 22 LTS and the repository's installed dependencies.
- Existing OpenRouter model configuration for model-backed tests.
- No new dependency or database migration is expected.

## Validation

Run the focused acceptance tests for learning, persistence replacement,
asynchronous task tracking, chat scheduling, and both agent/tool paths:

```powershell
node --import tsx --test src/agents/learning-reflector.test.ts src/services/learning-reflector.test.ts src/services/learning-task-runner.test.ts src/store/sqlite-memory-store.test.ts src/services/chat-service.test.ts src/services/memory-service.test.ts src/agents/tools.test.ts src/agents/react.test.ts src/agents/plan-and-execute.test.ts
npm run typecheck
npm test
```

These tests verify:

- durable facts learned after, but without delaying, a successful response;
- one-off instructions, uncertain content, and credentials not saved;
- learning failures logged without unhandled rejections or response failure;
- user-scoped `forget_preference` success, not-found, ambiguous, and failure
  outcomes;
- explicit corrections replacing only one unambiguously matched owned memory;
- ambiguous corrections preserving all existing memories and asking for
  clarification before the normal strategy runs;
- graceful shutdown draining learning tasks before closing SQLite.

The extractor and correction resolver accept injected structured-output
dependencies in unit tests; those checks do not require live model credentials.
Do not put credential values in test fixtures or logs. See [the extractor contract](./contracts/learning-reflector.md), [the tool contract](./contracts/forget-preference.md), and [the data model](./data-model.md).

## Expected outcome

Typecheck and all tests pass. Ordinary responses are available without waiting
for learning; explicit correction preflight may wait to detect an ambiguous
target. Only clear, durable, non-secret facts reach the owner's memory, and
uncertain forget/correction matches do not modify stored facts.
