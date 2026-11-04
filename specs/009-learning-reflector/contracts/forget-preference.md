# `forget_preference` Tool Contract

## Input

```json
{
  "preference": "concise incident summaries"
}
```

- `preference`: required, trimmed, non-empty, bounded description of the
  preference to forget.
- The tool does not accept a user identifier. It is bound to the identity
  validated for the current chat request.

## Behavior

1. Recall candidates using only the bound user's memories.
2. Remove a memory only if exactly one qualifying candidate matches.
3. If no candidate matches, return `not_found`; if multiple candidates match,
   return `ambiguous`. Neither result changes memory.
4. A successful removal affects only the matching memory ID and owner.
5. Storage or validation errors are reported as tool failures; they are never
   reported as a successful removal.

## Result

Return a compact status (`forgotten`, `not_found`, or `ambiguous`) that allows
the assistant to confirm removal only after success, or to request
clarification otherwise. Do not expose other users' data or accept a
model-supplied user identifier.
