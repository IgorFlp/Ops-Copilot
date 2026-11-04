import assert from "node:assert/strict";
import test from "node:test";
import { embed } from "./embeddings.js";
import { MemoryService } from "../services/memory-service.js";
import { SqliteMemoryStore } from "../store/sqlite-memory-store.js";

test("local embeddings recall a semantically matching fact without shared content words", async () => {
  const store = new SqliteMemoryStore(":memory:");
  const memories = new MemoryService(store, embed);
  try {
    const fact = "My dog loves to play with a ball.";
    const query = "What does my puppy enjoy doing with toys?";
    const stopWords = new Set(["my", "to", "with", "a", "what", "does", "doing"]);
    const words = (value: string) =>
      new Set(
        value
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s]/gu, "")
          .split(/\s+/)
          .filter((word) => word && !stopWords.has(word)),
      );
    const factWords = words(fact);
    assert.ok([...words(query)].every((word) => !factWords.has(word)));

    const saved = await memories.remember("semantic-test-user", fact);
    const recalled = await memories.recall("semantic-test-user", query);

    assert.equal(recalled[0]?.id, saved.id);
    assert.equal(recalled[0]?.fact, fact);
    assert.ok((recalled[0]?.score ?? 0) > 0.3);
  } finally {
    store.close();
  }
});
