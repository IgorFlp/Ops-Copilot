# Feature Specification: Model Resilience

**Feature Branch**: `014-model-resilience`

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "Resiliencia de modelo
- .env OPENROUTER_MODEL_FALLBACK
- fabrica model.ts: withRetry no primário, withFallbacks(reserva)
- Trace: evento "fallback", metrics: modelUsed
- caso nada funcione, erro 503"

## User Scenarios & Testing

### User Story 1 - Primary Model with Retry (Priority: P1)

When a request is made to the AI model, the system first attempts to use the primary model configured via `OPENROUTER_MODEL` with automatic retry logic for transient failures.

**Why this priority**: The primary model is the default and most common path. Retry logic improves reliability without requiring fallback configuration.

**Independent Test**: Can be tested by configuring only `OPENROUTER_MODEL` and verifying that transient errors (network timeout, rate limit) trigger retries before failing.

**Acceptance Scenarios**:

1. **Given** primary model is configured and healthy, **When** a request is made, **Then** the request succeeds using the primary model
2. **Given** primary model returns a transient error (5xx, timeout), **When** a request is made, **Then** the system retries up to the configured limit before giving up
3. **Given** primary model returns a non-retryable error (4xx), **When** a request is made, **Then** the system fails fast without retry

---

### User Story 2 - Fallback to Reserve Models (Priority: P1)

When the primary model fails after retries, the system automatically tries reserve models configured via `OPENROUTER_MODEL_FALLBACK` in order until one succeeds.

**Why this priority**: Fallback models provide resilience when the primary model is unavailable, degraded, or rate-limited.

**Independent Test**: Can be tested by configuring `OPENROUTER_MODEL_FALLBACK` with multiple models and simulating primary model failure to verify fallback chain execution.

**Acceptance Scenarios**:

1. **Given** primary model fails after retries and fallback models are configured, **When** a request is made, **Then** the system tries each fallback model in order until one succeeds
2. **Given** first fallback model fails, **When** a request is made, **Then** the system tries the next fallback model in the list
3. **Given** all fallback models fail, **When** a request is made, **Then** the system returns a 503 error

---

### User Story 3 - Trace Fallback Events and Model Usage (Priority: P2)

The system emits a "fallback" trace event when switching models and records which model was ultimately used in metrics.

**Why this priority**: Observability into fallback behavior is essential for debugging, monitoring, and understanding model reliability in production.

**Independent Test**: Can be tested by inspecting trace output and metrics when a fallback occurs to verify the "fallback" event and `modelUsed` metric are present.

**Acceptance Scenarios**:

1. **Given** a fallback occurs from primary to a reserve model, **When** the request completes, **Then** the trace includes a "fallback" event with the previous and new model names
2. **Given** any model succeeds (primary or fallback), **When** the request completes, **Then** the metrics include `modelUsed` indicating the successful model
3. **Given** multiple fallbacks occur in a single request, **When** the request completes, **Then** the trace includes a "fallback" event for each model switch

---

### User Story 4 - 503 Error When All Models Fail (Priority: P1)

When the primary model and all configured fallback models fail, the system returns a 503 Service Unavailable error.

**Why this priority**: Clear error signaling allows upstream callers to handle total model unavailability appropriately (retry, circuit breaker, user-facing error).

**Independent Test**: Can be tested by configuring models that all fail and verifying a 503 response is returned.

**Acceptance Scenarios**:

1. **Given** primary model and all fallback models fail, **When** a request is made, **Then** the system returns HTTP 503 with an appropriate error message
2. **Given** no fallback models are configured and primary fails, **When** a request is made, **Then** the system returns HTTP 503 after primary retries are exhausted

---

### Edge Cases

- What happens when `OPENROUTER_MODEL_FALLBACK` is empty or not set? (System should work with primary only)
- What happens when fallback list contains invalid model names? (Should skip invalid entries with warning, try next)
- How many retry attempts for primary vs fallbacks? (Assumption: configurable, default 3 for primary, 1 for fallbacks)
- What constitutes a "retryable" error? (Assumption: 5xx, timeout, network errors; not 4xx except 429)
- Can fallback models have different parameters (temperature, maxTokens)? (Assumption: use same parameters as primary)

## Requirements

### Functional Requirements

- **FR-001**: System MUST read `OPENROUTER_MODEL` from environment as the primary model
- **FR-002**: System MUST read `OPENROUTER_MODEL_FALLBACK` from environment as comma-separated list of fallback model identifiers
- **FR-003**: System MUST attempt the primary model with retry logic for transient failures before falling back
- **FR-004**: System MUST try fallback models in the order specified in `OPENROUTER_MODEL_FALLBACK` when primary fails after retries
- **FR-005**: System MUST emit a "fallback" trace event each time it switches from one model to another, including the previous and new model identifiers
- **FR-006**: System MUST record the ultimately successful model identifier in the `modelUsed` metric
- **FR-007**: System MUST return HTTP 503 Service Unavailable when the primary model and all configured fallback models fail
- **FR-008**: System MUST NOT retry non-retryable errors (4xx except 429) on any model
- **FR-009**: System MUST skip invalid or unavailable fallback models and continue to the next in the list
- **FR-010**: Model factory MUST provide retry capability for primary model and fallback chain capability for reserve models

### Key Entities

- **ModelConfiguration**: Represents the primary model and ordered list of fallback models sourced from environment variables
- **ModelAttempt**: Represents a single attempt to call a specific model, including retry count, error type, and outcome
- **FallbackEvent**: Trace event emitted when switching models, containing `fromModel`, `toModel`, `reason`, and timestamp
- **ModelMetrics**: Metrics collected per request, including `modelUsed` (successful model identifier), `fallbackCount`, `totalLatencyMs`

## Success Criteria

### Measurable Outcomes

- **SC-001**: Requests succeed on primary model in >99% of cases when primary is healthy
- **SC-002**: Fallback to reserve model completes within 2 seconds of primary failure (excluding model latency)
- **SC-003**: 100% of fallback transitions emit a "fallback" trace event with correct model identifiers
- **SC-004**: 100% of successful requests include `modelUsed` metric identifying the model that succeeded
- **SC-005**: System returns HTTP 503 within 30 seconds when all models are unavailable
- **SC-006**: Zero unhandled exceptions during model fallback chain execution

## Assumptions

- Environment variables are loaded using platform-native mechanisms (no external dotenv dependency)
- `OPENROUTER_MODEL_FALLBACK` uses comma-separated format (e.g., "model-a,model-b,model-c")
- Retry configuration: primary model gets 3 attempts with exponential backoff; fallbacks get 1 attempt each
- Retryable errors: HTTP 5xx, 429 (rate limit), network timeouts, connection errors
- Non-retryable errors: HTTP 4xx (except 429), authentication failures, invalid requests
- Existing model factory will be extended with resilience logic
- Trace events follow existing trace event structure
- Metrics follow existing metrics patterns
- Error handling follows existing domain error patterns
- No changes to the HTTP controller layer required; 503 is returned via existing error handler