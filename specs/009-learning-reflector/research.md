# Research: Learning Reflector

## Structured extraction

- **Decision**: Use the existing `ChatOpenAI` model factory and
  `withStructuredOutput` with a strict Zod result containing `hasLearning` and
  `fact`. The extractor receives only the newest user message. Use a
  conservative system prompt and a deterministic secret-pattern guard before
  persistence; an empty or invalid candidate is treated as no learning.
- **Rationale**: The repository already uses Zod-backed structured output for
  reflection and planning. LangChain documents runtime validation for Zod and
  supports structured-output strategies according to provider capabilities.
  This avoids a new model integration or dependency.
- **Alternatives considered**: Parse free-form model text (less reliable and
  requires custom parsing); add another provider SDK (unnecessary).
- **References**:
  - LangChain JavaScript structured output:
    https://docs.langchain.com/oss/javascript/langchain/models
  - LangChain JavaScript OpenAI-compatible custom base URL:
    https://docs.langchain.com/oss/javascript/concepts/providers-and-models

## Asynchronous post-response learning

- **Decision**: After a successful assistant response is persisted, submit an
  injected learning job without awaiting it in the request path. Keep a
  lifecycle-aware task tracker that records failures without logging message
  contents and can be drained before closing the default memory store.
- **Rationale**: This preserves the response latency contract while avoiding
  unhandled promise rejections and writes against a closed SQLite store during
  graceful shutdown. Do not schedule learning when strategy execution or
  assistant-message persistence fails.
- **Alternatives considered**: Await extraction after generating the answer
  (still delays HTTP response); untracked fire-and-forget promises (risk
  unhandled failures and shutdown races); external job queue (new operational
  dependency disproportionate to the current single-process service).

## Forget preference and correction matching

- **Decision**: `forget_preference` accepts a preference description, while
  the owner identity and memory service are closed over from the validated chat
  request. Use scoped recall and remove only when there is exactly one
  qualifying candidate; return an explicit ambiguous/not-found result without
  changing memory otherwise. For replacement, require an explicit correction
  and a structured resolver that selects exactly one recalled memory ID or
  returns no selection. Validate the selected ID against the user-scoped
  candidates, then atomically replace that row.
- **Rationale**: This implements the user's `replace_only_clear` choice and
  prevents semantic similarity alone from deleting a possibly unrelated
  memory. The existing memory service already provides scoped recall and
  deletion; adding an atomic scoped replacement avoids losing the old fact if
  writing the corrected fact fails.
- **Alternatives considered**: Delete the nearest match regardless of
  ambiguity (unsafe); delete first then remember (non-atomic and can lose the
  old fact); add corrected facts beside old facts (can present contradictory
  preferences); use a broad unscoped memory list (violates user isolation).
- **Relevant prior art**: `MemoryService.recall` scopes to `userId` and returns
  relevance-ranked candidates; `MemoryService.forget` requires both owner and
  memory ID. `createOpsToolsForRequest` and the plan-and-execute dispatcher
  are the existing tool integration surfaces.

## Dependency and integration practices

- **Decision**: Use existing `@langchain/core`, `@langchain/openai`, Zod,
  tool factory and dependency injection patterns. Do not add a package.
- **Rationale**: The repository already has a configured OpenRouter model,
  Zod contracts, LangChain tools, and injectable services; matching these
  reduces integration risk and keeps the model outside the domain service.
- **Alternatives considered**: Direct HTTP calls to OpenRouter or introducing
  a separate queue/database (duplicate current infrastructure).
