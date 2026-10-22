# Research: Reflection Layer

## Structured critic output

- **Decision**: Validate critic decisions as structured `{ approved, feedback }`
  data using the project's existing Zod and LangChain structured-output pattern.
- **Rationale**: LangChain.js documents `.withStructuredOutput(zodSchema)` for
  model output that is parsed against a Zod schema. The plan-and-execute agent
  already applies this pattern to planning, execution selection, and replanning.
- **Alternatives considered**: Parsing free-form text manually was rejected
  because it makes approval ambiguous and duplicates validation logic.
- **Sources**:
  - LangChain.js structured output documentation:
    https://docs.langchain.com/oss/javascript/integrations/chat/openai
  - LangChain.js model structured output documentation:
    https://docs.langchain.com/oss/javascript/langchain/models
  - Existing project pattern: `src/agents/plan-and-execute.ts`.

## Model selection and testing seams

- **Decision**: The critic uses the same model configuration and model factory
  as the wrapped strategy. Keep model/critic dependencies injectable for
  deterministic tests; do not introduce a new provider or configuration path.
- **Rationale**: The project centralizes OpenRouter model configuration in
  `src/agents/model.ts`, and strategy modules already accept injectable
  dependencies or invokers for offline tests.
- **Alternatives considered**: A separately configured critic model was
  rejected because the feature explicitly requires the same model. Tests that
  call the live provider were rejected because the project requires offline,
  deterministic unit tests.
- **Sources**: `src/agents/model.ts`,
  `src/agents/react.ts`, and `src/agents/plan-and-execute.ts`.

## Retry context, side effects, and accounting

- **Decision**: Treat `maxReflection` as a regeneration count: critique the
  initial answer, regenerate after each rejection up to the configured bound,
  and do not critique the final regeneration after the bound is exhausted.
  Preserve earlier observations and completed state-changing actions in retry
  context. Sum call counts from each base run plus one call per critique; measure
  elapsed time around the entire decorator run.
- **Rationale**: This matches the approved spec semantics and avoids counting a
  critique as a regeneration. It also addresses the existing strategies' ability
  to invoke persistent operational mutations. Wall-clock measurement at the
  wrapper captures the complete user-visible run without double-counting nested
  durations.
- **Alternatives considered**: Counting critiques as the limit was rejected
  because the requested behavior counts regenerations. Summing attempt latency
  was rejected because it could omit decorator overhead and misrepresent
  concurrent or overlapping work. Re-running with only a feedback string was
  rejected because it could discard observations or repeat completed mutations.
- **Sources**: Feature specification; existing action and observation trace
  shapes in `src/agents/types.ts`, `src/agents/react.ts`, and
  `src/agents/plan-and-execute.ts`.

## Arena compatibility

- **Decision**: Add the two reflected names and optional `maxReflection` to the
  existing arena request contract, but retain the existing default selection
  of the two unreflected strategies when `strategies` is omitted.
- **Rationale**: Explicit selection adds the requested capability without
  silently increasing model usage or changing existing clients' default
  response set.
- **Alternatives considered**: Running all four strategies by default was
  rejected because it would change existing arena behavior and increase default
  model calls.
- **Sources**: Existing `src/services/arena-service.ts`,
  `src/controllers/arena-controller.ts`, and
  `specs/001-reasoning-arena/contracts/arena-api.yaml`.
