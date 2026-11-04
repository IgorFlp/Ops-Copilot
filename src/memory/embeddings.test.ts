import assert from "node:assert/strict";
import test from "node:test";
import { EMBEDDING_DIMENSIONS, createEmbedder } from "./embeddings.js";

test("embedder loads one extractor lazily and shares concurrent initialization", async () => {
  let loadCount = 0;
  const expected = new Float32Array(EMBEDDING_DIMENSIONS).fill(1 / Math.sqrt(EMBEDDING_DIMENSIONS));
  const embed = createEmbedder(async () => {
    loadCount += 1;
    await Promise.resolve();
    return async (_text, options) => {
      assert.deepEqual(options, { pooling: "mean", normalize: true });
      return { data: expected, dims: [1, EMBEDDING_DIMENSIONS] };
    };
  });

  assert.equal(loadCount, 0);
  const [first, second] = await Promise.all([
    embed("first fact"),
    embed("second fact"),
  ]);
  assert.equal(loadCount, 1);
  assert.equal(first.length, EMBEDDING_DIMENSIONS);
  assert.equal(second.length, EMBEDDING_DIMENSIONS);
  assert.ok(first.every(Number.isFinite));
  assert.ok(Math.abs(Math.hypot(...first) - 1) < 1e-5);
});

test("embedder rejects malformed model output", async () => {
  const embed = createEmbedder(async () => async () => ({
    data: new Float32Array(2),
    dims: [1, 2],
  }));
  await assert.rejects(embed("invalid shape"), /384/);
});
