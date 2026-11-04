# Research: Semantic Memory

## Decision 1: Run sentence embedding inference locally

- **Decision**: Add `@huggingface/transformers` and use the
  `feature-extraction` pipeline with `Xenova/all-MiniLM-L6-v2`. Request
  `pooling: "mean"` and `normalize: true`; in Node.js, use the CPU default.
- **Rationale**: The selected package provides a JavaScript/Node runtime and
  the requested mean-pooling and L2-normalization options. The resulting
  normalized vectors make dot product a cosine-similarity ranking score.
  Running inference locally avoids sending memory facts to a hosted embedding
  service. The model card demonstrates this exact pipeline/model pairing and
  reports a Float32 tensor with 384 values per sentence.
- **Alternatives considered**: Hosted embedding APIs (not local); another
  embedding model (not requested); implementing tokenization/pooling separately
  (unnecessary and risks diverging from the library's model handling).
- **Operational note**: Transformers.js supports remote model loading and
  caching by default, so the first use may need network access to obtain model
  artifacts. Subsequent inference can use the cached/local artifacts. Local
  model paths and disabling remote loading are supported if deployment later
  requires a pre-provisioned offline model.
- **Sources**:
  - [Transformers.js Node.js guide](https://huggingface.co/docs/transformers.js/en/tutorials/node)
  - [Transformers.js feature extraction pipeline](https://huggingface.co/docs/transformers.js/api/pipelines#module_pipelines.FeatureExtractionPipeline)
  - [Transformers.js environment settings](https://huggingface.co/docs/transformers.js/api/env)
  - [Xenova/all-MiniLM-L6-v2 model](https://huggingface.co/Xenova/all-MiniLM-L6-v2)

## Decision 2: Initialize the model and default memory service lazily

- **Decision**: Keep one shared in-flight initialization promise for the
  embedding pipeline in `src/memory/embeddings.ts`, and one lazy default
  memory-service composition in `src/memory/memory-store.ts`.
- **Rationale**: Avoid loading model files during application startup when
  memory is unused, and avoid concurrent first requests initializing duplicate
  pipelines. Preserve dependency injection so tests can use deterministic
  embedders and in-memory stores.
- **Alternatives considered**: Eager startup loading (adds startup/network
  failure even when chat memory is unused); creating a pipeline for every
  request (wastes CPU and memory).

## Decision 3: Store normalized float vectors in SQLite BLOBs

- **Decision**: Store each 384-dimensional model vector as 32-bit float data
  in the `memories.embedding` BLOB column. Read only the requesting user's
  rows, compute dot products in application code, filter scores strictly
  greater than `0.3` before sorting and limiting, sort by
  score descending, and return no more than three.
- **Rationale**: This follows the requested schema and uses normalized vectors
  to make dot product equal cosine similarity. With the specified initial
  scope of 1,000 memories per user, a scoped linear scan avoids an additional
  vector database or extension.
- **Alternatives considered**: Store vectors as JSON/text (larger and requires
  parsing); add an external vector database or SQLite extension (unnecessary
  operational complexity for the stated scale).

## Decision 4: Deduplicate and forget within the user's scope

- **Decision**: Compute the incoming fact embedding, compare only with that
  user's stored vectors, and suppress insertion only when a dot product is
  strictly greater than `0.92`. Forget uses both `userId` and memory `id` in
  the delete predicate. A duplicate leaves the stored fact unchanged.
- **Rationale**: These choices implement the specified thresholds and prevent
  cross-user reads or mutations. The check-and-insert is performed atomically
  after embedding so simultaneous saves cannot bypass deduplication.
- **Alternatives considered**: Global deduplication (would mix user data);
  replacing the existing fact (not requested); deleting by memory ID alone
  (would not enforce the ownership boundary).

## Decision 5: Keep memory CRUD internal and make chat the public integration

- **Decision**: Expose `remember`, `recall`, and `forget` through the memory
  service/store interface; add no new HTTP routes. Require a non-empty
  `userId` in `/chat` and attach recall results to the strategy input through
  the shared prompt formatter as a labeled, untrusted reference section.
- **Rationale**: The request names `MemoryStore` operations and specifically
  asks `/chat` to gain `userId`; it does not specify public CRUD endpoints.
  The shared formatter ensures all existing chat strategies receive the same
  relevant context.
- **Alternatives considered**: Add separate REST endpoints for CRUD (would
  expand the API contract and authorization surface without a specified
  request).
- **Trust boundary**: A `userId` scopes memory but does not authenticate the
  caller. This feature adds no authentication; deployment must provide the
  identity through a trusted upstream boundary before exposing user-scoped
  memory to untrusted clients.
