# Data Model: Context Token Metrics

## Token estimate

A pure, non-persisted estimate of token count for one text source.

| Field | Type | Rules |
|---|---|---|
| source text | string | Count Unicode code points. |
| estimated tokens | integer | `floor(codePointCount / 4)`; always non-negative. |

The estimate is diagnostic only. It is not a tokenizer result, provider
measurement, quota, billing value, or context-window guarantee.

## Context breakdown

Per-turn estimates for application-visible text assembled by the chat service.

| Field | Type | Rules |
|---|---|---|
| `currentMessage` | integer | Required; estimate for the current user request. |
| `history` | integer | Present only when prior conversation messages are included; estimate over their text content. |
| `memories` | integer | Present only when recalled facts are included; estimate over their text content. |

Each source is counted and rounded down independently once. Role labels,
separators, static agent instructions, tool schemas, model serialization, and
provider-side formatting are excluded. The estimates are computed once for a
chat turn, regardless of how many model calls the strategy makes.

## Actual prompt usage

An optional actual metric aggregated over all model invocations caused by one
chat run.

| Field | Type | Rules |
|---|---|---|
| `metrics.promptTokens` | integer, optional | Sum of reported input/prompt tokens for every invocation; non-negative. Omit if any invocation does not provide a valid reported count. |

Usage is read from LangChain model-response metadata and is never estimated.
An invocation with no reported usage is unknown, not zero. Runs that make no
model invocation also omit this field.

## Chat response metrics

Existing metrics remain unchanged; the following additions are returned in
`metrics`:

| Field | Type | Rules |
|---|---|---|
| `contextBreakdown` | object | Required; contains `currentMessage` and source estimates for history/memories when those sources are present. |
| `promptTokens` | integer, optional | Actual complete-run prompt usage as defined above. |

These are diagnostic measurements only and are not persisted with conversation
messages.
