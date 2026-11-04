# Data Model: Learning Reflector

## Candidate Learning

A temporary result from evaluating exactly one latest user message.

| Field | Type | Rules |
|---|---|---|
| `hasLearning` | boolean | `true` only for a clear, durable, useful fact; `false` for transient, uncertain, or secret content |
| `fact` | string | Trimmed, non-empty and bounded when `hasLearning` is true; empty when false; must not contain a detected credential |

Candidate results are transient and are not persisted separately. Extraction failure, schema failure, or secret detection produces no memory write and an explicit sanitized operational log.

## Learned Memory

The existing `memories` record remains the source of truth.

| Field | Type | Rules |
|---|---|---|
| `id` | integer | Stable identifier for scoped replacement or deletion |
| `user_id` | string | Owner; derived from validated chat request and required in every operation |
| `fact` | string | Durable, non-secret fact |
| `embedding` | vector blob | Existing normalized embedding representation |
| `created_at` | timestamp | Existing creation timestamp |

No schema migration is required. Add a store-level replace operation that changes `fact` and `embedding` for a row matching both `user_id` and `id`, preserving atomicity and user scoping. Keep the current row identifier and timestamp semantics unless implementation tests show the store requires a new timestamp.

## Forget Preference Request

| Field | Type | Rules |
|---|---|---|
| `preference` | string | Required, trimmed, bounded description from the model tool call |
| `userId` | string | Not model-supplied; captured from the validated request context |

The request is resolved against only the owner's recall candidates. Exactly one qualifying match may be deleted. Zero matches returns not found; multiple matches returns ambiguous. Both non-success cases leave all records untouched.

## Correction Resolution

| Field | Type | Rules |
|---|---|---|
| `userMessage` | string | Latest user message only |
| `candidateFact` | string | Proposed corrected durable fact |
| `memories` | list of `{id, fact}` | At most the existing recall limit, all owned by the request user |
| `supersededMemoryId` | integer or null | Must be one of the supplied IDs; select only for an explicit correction with exactly one unambiguous target |

When an explicit correction cannot be matched to exactly one existing fact, do not modify memory and ask the user to clarify. When a target is selected, replace that owned row atomically with the candidate fact and its embedding.
