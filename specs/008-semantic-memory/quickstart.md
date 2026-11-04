# Quickstart: Semantic Memory Validation

## Prerequisites

- Node.js 22.13 or newer.
- Project dependencies installed.
- Network access on first use of the local model, unless its artifacts are
  already cached or pre-provisioned.

## Automated validation

Run the type check and complete test suite:

```powershell
npm run typecheck
npm test
```

The suite should verify, at minimum:

- SQLite `:memory:` persistence, BLOB round-tripping, duplicate boundary,
  recall threshold (`score > 0.3`)/top-three ordering, and user isolation
  using deterministic fake embeddings.
- Chat request rejection without `userId`, and strategy input containing
  recalled facts only from that user alongside the current message and history.
- Targeted forget removing exactly one owned fact and not disclosing or
  changing another user's fact.

## Model-backed semantic acceptance

Run the dedicated model-backed check separately from the default offline test
suite:

```powershell
node --import tsx --test src/memory/semantic-recall.integration.ts
```

It must save a fact and recall it from a query with no shared content words,
with a score strictly greater than `0.3`. The first run may download model artifacts;
subsequent runs should use the normal Transformers.js cache.

Run the 1,000-memory recall performance check after model artifacts are cached:

```powershell
node --import tsx src/memory/memory-recall.bench.ts
```

The benchmark warms the model, measures 100 recall requests over 1,000 facts,
and reports the p95 latency; the target is under one second. On the current
acceptance run, p95 was **74.84 ms**.

## Acceptance walkthrough

1. Use a disposable SQLite `:memory:` database and save two distinct facts for
   one user plus a fact for a second user.
2. Recall with a semantically equivalent query that uses different content
   words from the saved fact; confirm that the relevant owned fact appears
   with score greater than `0.3`, and that no other user's fact appears.
3. Save a near-duplicate for the first user; confirm similarity above `0.92`
   prevents a second row. Confirm a score equal to `0.92` does not trigger the
   strictly-greater-than rule.
4. Save at least four relevant facts for one user; confirm results are ranked
   by score and capped at three.
5. Forget one selected memory ID; confirm only that owner's matching fact is
   removed. Repeat with another user's ID and confirm it is not changed.
6. Submit `/chat` without `userId` and confirm validation fails. Submit a
   valid request and inspect the injected strategy input to verify that memory
   context is scoped to the supplied user.

For schema details and request contracts, see [data-model.md](./data-model.md),
[chat.md](./contracts/chat.md), and
[memory-service.md](./contracts/memory-service.md).
