import assert from "node:assert/strict";
import test from "node:test";
import { EMBEDDING_DIMENSIONS } from "../memory/embeddings.js";
import { SqliteMemoryStore } from "../store/sqlite-memory-store.js";
import {
  isRecallScoreRelevant,
  MemoryService,
} from "./memory-service.js";

function vector(score: number): Float32Array {
  const result = new Float32Array(EMBEDDING_DIMENSIONS);
  result[0] = score;
  return result;
}

test("recall relevance uses a strict threshold greater than 0.3", () => {
  assert.equal(isRecallScoreRelevant(0.3), false);
  assert.equal(isRecallScoreRelevant(0.300001), true);
});

test("recall filters scores at or below 0.3 before ranking and applying k", async () => {
  const store = new SqliteMemoryStore(":memory:");
  const vectors = new Map([
    ["low", vector(0.299)],
    ["second", vector(0.8)],
    ["first", vector(0.95)],
    ["third", vector(0.7)],
    ["fourth", vector(0.6)],
    ["query", vector(1)],
  ]);
  const service = new MemoryService(store, async (text) => {
    const embedding = vectors.get(text);
    if (!embedding) throw new Error("Unexpected test query");
    return embedding;
  });
  try {
    for (const fact of ["low", "second", "first", "third", "fourth"]) {
      await service.remember("user-a", fact);
    }
    const recalled = await service.recall("user-a", "query", 3);
    assert.deepEqual(
      recalled.map(({ fact }) => fact),
      ["first", "second", "third"],
    );
    assert.deepEqual(
      recalled.map(({ score }) => score),
      [Math.fround(0.95), Math.fround(0.8), Math.fround(0.7)],
    );
    assert.ok(recalled.every(({ score }) => score !== undefined && score > 0.3));
    assert.deepEqual(await service.recall("user-a", "low"), []);
  } finally {
    store.close();
  }
});

test("recall returns only the requested user's top matches", async () => {
  const store = new SqliteMemoryStore(":memory:");
  const vectors = new Map([
    ["query", vector(1)],
    ["user-a fact", vector(0.8)],
    ["user-b fact", vector(0.99)],
  ]);
  const service = new MemoryService(store, async (text) => {
    const embedding = vectors.get(text);
    if (!embedding) throw new Error("Unexpected test input");
    return embedding;
  });
  try {
    await service.remember("user-a", "user-a fact");
    await service.remember("user-b", "user-b fact");
    assert.deepEqual(
      (await service.recall("user-a", "query")).map(({ fact }) => fact),
      ["user-a fact"],
    );
  } finally {
    store.close();
  }
});
