# Internal Memory Service Contract

These are application operations, not new HTTP endpoints.

| Operation | Inputs | Result and guarantees |
|-----------|--------|----------------------|
| `remember` | `userId`, non-empty `fact` | Save the fact unless an existing fact for that user scores strictly above `0.92`; a duplicate preserves the existing row. |
| `recall` | `userId`, non-empty query, optional `k` defaulting to `3` | Embed the query, score only that user's facts by normalized-vector dot product, filter scores strictly greater than `0.3`, rank descending, then return at most `k` facts. |
| `forget` | `userId`, memory `id` | Delete only the matching user's selected fact. A missing or foreign-owned ID is reported as not found without disclosing ownership. |

All operations surface persistence or embedding failures explicitly. Each
operation accepts the user identifier as a required argument; no global or
unscoped memory access is supported.
