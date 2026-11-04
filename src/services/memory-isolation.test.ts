import assert from "node:assert/strict";
import test from "node:test";
import { EMBEDDING_DIMENSIONS } from "../memory/embeddings.js";
import { DomainError } from "../errors/domain-error.js";
import { SqliteMemoryStore } from "../store/sqlite-memory-store.js";
import { MemoryService } from "./memory-service.js";

const sharedEmbedding = new Float32Array(EMBEDDING_DIMENSIONS).fill(
  1 / Math.sqrt(EMBEDDING_DIMENSIONS),
);

test("remember, recall, and forget never cross user boundaries", async () => {
  const store = new SqliteMemoryStore(":memory:");
  const service = new MemoryService(store, async () => sharedEmbedding);
  try {
    const first = await service.remember("user-a", "same semantic fact");
    const second = await service.remember("user-b", "same semantic fact");
    assert.notEqual(first.id, second.id);

    const recalledA = await service.recall("user-a", "query");
    const recalledB = await service.recall("user-b", "query");
    assert.deepEqual(recalledA.map(({ userId }) => userId), ["user-a"]);
    assert.deepEqual(recalledB.map(({ userId }) => userId), ["user-b"]);

    await assert.rejects(
      service.forget("user-a", second.id),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === "NOT_FOUND" &&
        error.message === "Memory not found",
    );
    await service.forget("user-b", second.id);
    assert.equal((await store.all("user-a")).length, 1);
    assert.equal((await store.all("user-b")).length, 0);
  } finally {
    store.close();
  }
});
