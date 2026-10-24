# Data Model: Chat API

## Chat request

One request to run a single reasoning strategy.

| Field | Type | Rules |
|---|---|---|
| `message` | string | Required; trimmed; must contain at least one non-whitespace character. |
| `strategy` | string | Optional; defaults to `react`; unknown names are reported as unsupported strategy, not malformed type. |
| `reflect` | boolean | Optional; defaults to `false`; when true, the selected base strategy is decorated with reflection for this run. |
| additional fields | none | Rejected as invalid input. |

The request is validated before registry resolution and strategy execution.

## Strategy registry entry

An available reasoning strategy, identified by a stable name and callable run
operation.

| Field | Type | Rules |
|---|---|---|
| `name` | string | Unique registry key; initial keys are `react` and `plan-and-execute`. |
| `strategy` | reasoning strategy | Receives the request message and supported run options; returns a reasoning result. |

For a reflected request, the registry applies the reflection decorator to the
resolved base strategy. Reflection is not applied to unknown names.

## Chat result

The existing reasoning result returned by the selected strategy.

| Field | Type | Rules |
|---|---|---|
| `answer` | string | Final user-facing answer. |
| `trace` | ordered trace events | Execution and reflection events from the strategy. |
| `metrics.calls` | integer | Model call count supplied by the strategy. |
| `metrics.latencyMs` | number | Elapsed time supplied by the strategy, non-negative. |

The success response is the result object itself, without an additional wrapper.

## API error outcomes

| Condition | HTTP status | Response data |
|---|---:|---|
| Invalid JSON body shape or field | 400 | Generic invalid-request message and structured validation issues with field paths. |
| Valid request with unknown strategy | 422 | Stable error indicating the unsupported strategy name. |
| Strategy run exceeds 180 seconds | 504 | Stable timeout error without internal stack or provider details. |
| Other strategy/reflection failure | 500 | Sanitized internal error response; never a success result. |
