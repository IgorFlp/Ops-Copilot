import assert from "node:assert/strict";
import test from "node:test";
import { EMBEDDING_DIMENSIONS } from "../memory/embeddings.js";
import { SqliteMemoryStore } from "../store/sqlite-memory-store.js";
import { DomainError } from "../errors/domain-error.js";
import { MemoryService } from "./memory-service.js";

const vector = (score: number): Float32Array => {
  const result = new Float32Array(EMBEDDING_DIMENSIONS);
  result[0] = score;
  return result;
};

test("remember avoids same-user near-duplicates and preserves distinct facts", async () => {
  const store = new SqliteMemoryStore(":memory:");
  const embeddings = new Map([
    ["original", vector(1)],
    ["duplicate", vector(0.94)],
    ["distinct", vector(0.9)],
  ]);
  const service = new MemoryService(store, async (text) => {
    const embedding = embeddings.get(text);
    if (!embedding) throw new Error("Unexpected test fact");
    return embedding;
  });
  try {
    const original = await service.remember("user-a", "original");
    const duplicate = await service.remember("user-a", "duplicate");
    assert.equal(duplicate.id, original.id);
    await service.remember("user-a", "distinct");
    assert.equal((await store.all("user-a")).length, 2);
  } finally {
    store.close();
  }
});

test("forget removes one owned fact and reports unknown or foreign identifiers", async () => {
  const store = new SqliteMemoryStore(":memory:");
  const service = new MemoryService(store, async () => vector(1));
  try {
    const owned = await service.remember("user-a", "owned fact");
    const foreign = await service.remember("user-b", "foreign fact");

    await assert.rejects(
      service.forget("user-a", foreign.id),
      (error: unknown) =>
        error instanceof DomainError && error.code === "NOT_FOUND",
    );
    await service.forget("user-a", owned.id);
    assert.deepEqual((await store.all("user-b")).map(({ fact }) => fact), [
      "foreign fact",
    ]);
  } finally {
    store.close();
  }
});

test("memory operations reject blank owners and recall limits", async () => {
  const store = new SqliteMemoryStore(":memory:");
  const service = new MemoryService(store, async () => vector(1));
  try {
    await assert.rejects(
      service.remember("  ", "fact"),
      (error: unknown) =>
        error instanceof DomainError && error.code === "VALIDATION",
    );
    await assert.rejects(
      service.recall("user-a", "query", 0),
      (error: unknown) =>
        error instanceof DomainError && error.code === "VALIDATION",
    );
  } finally {
    store.close();
  }
});

test("embedding failures are surfaced and do not produce a saved memory", async () => {
  const store = new SqliteMemoryStore(":memory:");
  const service = new MemoryService(store, async () => {
    throw new Error("embedding unavailable");
  });
  try {
    await assert.rejects(
      service.remember("user-a", "fact"),
      /embedding unavailable/,
    );
    assert.deepEqual(await store.all("user-a"), []);
  } finally {
    store.close();
  }
});

test("forgetPreference removes exactly one relevant owned memory", async () => {
  const store = new SqliteMemoryStore(":memory:");
  const vectors = new Map([
    ["concise", vector(1)],
    ["concise summaries", vector(0.9)],
    ["verbose summaries", vector(0.8)],
  ]);
  const service = new MemoryService(store, async (text) => {
    const result = vectors.get(text);
    if (!result) throw new Error("Unexpected query");
    return result;
  });
  try {
    const target = await service.remember("user-a", "concise");
    await service.remember("user-a", "verbose summaries");
    await service.remember("user-b", "concise summaries");

    const result = await service.forgetPreference("user-a", "concise");
    assert.deepEqual(result, { status: "ambiguous" });
    assert.deepEqual(
      (await store.all("user-a")).map(({ fact }) => fact),
      ["concise", "verbose summaries"],
    );

    const exactVectors = new Map([
      ["unique", vector(1)],
      ["unique preference", vector(1)],
    ]);
    const uniqueService = new MemoryService(store, async (text) => {
      const result = exactVectors.get(text);
      if (!result) throw new Error("Unexpected query");
      return result;
    });
    const unique = await uniqueService.remember("user-c", "unique preference");
    assert.deepEqual(
      await uniqueService.forgetPreference("user-c", "unique"),
      { status: "forgotten", memoryId: unique.id },
    );
    assert.deepEqual(await uniqueService.forgetPreference("user-c", "unique"), {
      status: "not_found",
    });
    assert.deepEqual((await store.all("user-b")).map(({ fact }) => fact), [
      "concise summaries",
    ]);
    assert.equal(target.id > 0, true);
  } finally {
    store.close();
  }
});
