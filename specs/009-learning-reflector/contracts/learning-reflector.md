# Learning Reflector Contract

## Trigger

After a successful chat strategy response has been persisted, schedule learning
for the current `userId` and the latest user message. Do not await learning
before returning the response. Do not run learning after strategy or response
persistence failure.

For an explicit correction, prepare its candidate and resolve the target before
running the normal strategy. If the target is ambiguous, persist and return a
clarification question without running the strategy or changing memory. If one
target is selected, pass that prepared decision to the post-response task and
replace it only after the strategy response is persisted. This preflight is the
intentional exception to non-blocking learning.

## Extractor input and output

Input evidence is the latest user message only. Do not include conversation
history, assistant text, model-selected identity, or unrelated memory facts as
evidence for a new fact.

The structured result has this shape:

```json
{
  "hasLearning": true,
  "fact": "The operator prefers concise incident summaries."
}
```

For no eligible fact, return `hasLearning: false` and an empty `fact`. The
extractor must reject one-time instructions, secrets, and uncertain facts.
Malformed output, secret detection, or extractor failure causes no memory
write. Operational logs must not include the source message or extracted fact.

## Persistence

Call the existing user-scoped memory service. A repeated fact follows existing
duplicate prevention. An explicit correction may replace an existing fact only
when one owned candidate is identified unambiguously; replacement must be
scoped and atomic. An explicit but ambiguous correction does not create a
second potentially contradictory memory and asks the user to clarify before
the normal strategy runs.

## Completion and failure

The chat response completes independently of the learning task. Learning
failures are logged as failures, do not create success-shaped results, and do
not retract an already delivered response. Track pending jobs and drain them
before closing the default memory store during graceful shutdown.
