# Research: Chat API

## Strategy registry and reflection selection

- **Decision**: Add a focused registry in `src/agent/index.ts` that resolves
  the existing `react` and `plan-and-execute` strategy names. Apply
  `withReflection` to the selected base strategy only when `reflect` is true;
  do not add reflected names to the request's strategy namespace.
- **Rationale**: The request describes a boolean reflection switch separate
  from strategy selection, and the repository already exposes a reusable
  `withReflection` decorator and named `ReasoningStrategy` interface. The
  dedicated registry keeps lookup independent of HTTP and avoids duplicating
  reflection variants in controllers.
- **Alternatives considered**: Selecting the arena's `reflect:react` names
  directly was rejected because it changes the requested API semantics and
  makes `reflect` redundant. Keeping registry lookup inside the controller was
  rejected because it mixes orchestration with HTTP concerns.
- **Sources**: `src/agents/types.ts`, `src/agents/reflection.ts`,
  `src/services/arena-service.ts`.

## Request validation and error translation

- **Decision**: Parse a strict object with a trimmed, non-empty message,
  optional non-empty strategy name, and optional boolean `reflect`. Apply
  defaults after validation (`react`, `false`). Translate Zod errors to 400
  with structured issues; use a distinct domain error code for unknown
  strategies and map it to 422. Keep malformed request precedence over lookup.
- **Rationale**: This follows the existing Zod, `DomainError`, and Express
  error-handler patterns while ensuring unsupported strategy names are
  distinguishable from malformed request data.
- **Alternatives considered**: Restricting `strategy` to a schema enum was
  rejected because unknown values would become 400 rather than the explicitly
  required 422. Returning raw Zod errors was rejected in favor of the
  project's existing sanitized `{ path, message }` representation.
- **Sources**: `src/controllers/arena-controller.ts`,
  `src/middleware/error-handler.ts`, `src/errors/domain-error.ts`.

## Deadline behavior

- **Decision**: Enforce a 180-second response deadline around one strategy run.
  If it expires before a result is available, return a typed timeout failure
  that maps to 504. Make the deadline configurable through an injected
  controller/handler dependency for fast deterministic tests while keeping
  180 seconds as the production default.
- **Rationale**: This provides the required externally visible timeout without
  waiting three minutes in tests. Express handlers must settle the response
  once; a late strategy completion must not attempt to send a second response.
- **Alternatives considered**: A test-only sleep of 180 seconds was rejected
  as slow and nondeterministic. Treating a disconnected client as a successful
  strategy result was rejected.
- **Cancellation constraint**: Existing strategy APIs do not accept an abort
  signal. The HTTP request can be timed out, but an already-started model or
  tool operation may continue in the background until it settles. The
  implementation must avoid unhandled rejections and must not send a late
  response. Adding cancellation across every strategy is outside this feature's
  current scope.
- **Sources**: `src/agents/types.ts`, `src/controllers/arena-controller.ts`,
  `src/app.ts`.

## Deterministic HTTP integration testing

- **Decision**: Test the real route and middleware through an ephemeral
  loopback HTTP server, injecting a registry with deterministic fake
  strategies and a fake reflection critic. Inject a short test deadline for
  timeout coverage.
- **Rationale**: This exercises JSON parsing, validation, route dispatch,
  registry selection, reflection choice, status mapping, and response
  serialization without live model, database, or external network dependencies.
  Existing controller tests already use an in-process Express server and
  `fetch`.
- **Alternatives considered**: Testing only pure parsing functions was
  rejected because it does not verify the externally visible HTTP contract.
  Live provider tests were rejected because they are nondeterministic and
  require credentials.
- **Sources**: `src/controllers/arena-controller.test.ts`,
  `src/middleware/error-handler.ts`, `src/app.ts`.
