import assert from "node:assert/strict";
import test from "node:test";
import { EMBEDDING_DIMENSIONS } from "../memory/embeddings.js";
import { SqliteMemoryStore } from "./sqlite-memory-store.js";

function vector(value: number): Float32Array {
  return new Float32Array(EMBEDDING_DIMENSIONS).fill(value);
}

test("SQLite memory store persists and round-trips embedding BLOBs", async () => {
  const store = new SqliteMemoryStore(":memory:");
  try {
    const columns = store._db
      .prepare("PRAGMA table_info(memories)")
      .all()
      .map((row) => row.name);
    assert.deepEqual(columns, ["id", "user_id", "fact", "embedding", "created_at"]);
    const created = await store.create("user-a", "primary database", vector(0.25));
    const records = await store.all("user-a");
    assert.equal(records.length, 1);
    assert.equal(records[0].id, created.id);
    assert.equal(records[0].userId, "user-a");
    assert.equal(records[0].fact, "primary database");
    assert.equal(records[0].embedding.length, EMBEDDING_DIMENSIONS);
    assert.equal(records[0].embedding[0], 0.25);
    assert.match(records[0].createdAt, /^\d{4}-\d\d-\d\dT/);
  } finally {
    store.close();
  }
});

test("SQLite memory store scopes listing and deletion by user", async () => {
  const store = new SqliteMemoryStore(":memory:");
  try {
    const owned = await store.create("user-a", "owned fact", vector(0.1));
    const foreign = await store.create("user-b", "foreign fact", vector(0.2));

    assert.deepEqual((await store.all("user-a")).map(({ fact }) => fact), [
      "owned fact",
    ]);
    assert.equal(await store.delete("user-a", foreign.id), false);
    assert.deepEqual((await store.all("user-b")).map(({ fact }) => fact), [
      "foreign fact",
    ]);
    assert.equal(await store.delete("user-a", owned.id), true);
    assert.deepEqual(await store.all("user-a"), []);
  } finally {
    store.close();
  }
});

test("SQLite memory store replaces one owned fact and preserves its timestamp", async () => {
  const store = new SqliteMemoryStore(":memory:");
  try {
    const owned = await store.create("user-a", "old fact", vector(0.1));
    const unrelated = await store.create("user-a", "unrelated fact", vector(0.2));
    const foreign = await store.create("user-b", "foreign fact", vector(0.3));
    const before = (await store.all("user-a"))[0].createdAt;

    assert.equal(
      await store.replace("user-a", owned.id, "corrected fact", vector(0.4)),
      true,
    );
    assert.equal(
      await store.replace("user-a", foreign.id, "incorrect update", vector(0.5)),
      false,
    );

    const userA = await store.all("user-a");
    assert.deepEqual(userA.map(({ fact }) => fact), [
      "corrected fact",
      "unrelated fact",
    ]);
    assert.equal(userA[0].embedding[0], new Float32Array([0.4])[0]);
    assert.equal(userA[0].createdAt, before);
    assert.deepEqual((await store.all("user-b")).map(({ fact }) => fact), [
      "foreign fact",
    ]);
    assert.equal(userA[1].id, unrelated.id);
  } finally {
    store.close();
  }
});
