import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { EMBEDDING_DIMENSIONS, embed } from "./embeddings.js";
import { MemoryService } from "../services/memory-service.js";
import { SqliteMemoryStore } from "../store/sqlite-memory-store.js";

function deterministicEmbedding(seed: number): Float32Array {
  let state = seed;
  const embedding = new Float32Array(EMBEDDING_DIMENSIONS);
  let norm = 0;
  for (let index = 0; index < embedding.length; index += 1) {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    const value = (state / 0xffff_ffff) * 2 - 1;
    embedding[index] = value;
    norm += value * value;
  }
  const magnitude = Math.sqrt(norm);
  for (let index = 0; index < embedding.length; index += 1) {
    embedding[index] /= magnitude;
  }
  return embedding;
}

const store = new SqliteMemoryStore(":memory:");
try {
  for (let index = 0; index < 1_000; index += 1) {
    await store.create(
      "benchmark-user",
      `Benchmark memory ${index}`,
      deterministicEmbedding(index + 1),
    );
  }

  const memories = new MemoryService(store, embed);
  const query = "Which region hosts the production service?";
  await memories.recall("benchmark-user", query);

  const samples: number[] = [];
  for (let index = 0; index < 100; index += 1) {
    const start = performance.now();
    await memories.recall("benchmark-user", query);
    samples.push(performance.now() - start);
  }
  samples.sort((left, right) => left - right);
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
  console.info(`1000-memory recall p95: ${p95.toFixed(2)} ms`);
  assert.ok(p95 < 1_000, `Expected recall p95 below 1000 ms, got ${p95.toFixed(2)} ms`);
} finally {
  store.close();
}
