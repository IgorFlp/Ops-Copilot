import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../errors/domain-error.js";
import { SqliteConversationStore } from "./sqlite-conversation-store.js";

test("SQLite conversation store creates conversations and appends ordered messages", async () => {
  const store = new SqliteConversationStore(":memory:");
  try {
    const conversation = await store.create();
    assert.ok(conversation.id);

    const user = await store.append(conversation.id, "user", "Check alerts");
    const assistant = await store.append(
      conversation.id,
      "assistant",
      "Two critical alerts are firing.",
    );

    assert.ok(user.id < assistant.id);
    assert.equal(user.conversationId, conversation.id);
    assert.equal(user.role, "user");
    assert.equal(user.content, "Check alerts");
    assert.equal(assistant.role, "assistant");
    assert.equal(assistant.content, "Two critical alerts are firing.");

    const otherConversation = await store.create();
    await store.append(otherConversation.id, "user", "Other thread");
    assert.equal(
      (
        await store.lastMessages(conversation.id, 12)
      ).some(({ content }) => content === "Other thread"),
      false,
    );
  } finally {
    store.close();
  }
});

test("SQLite conversation store does not append to an unknown conversation", async () => {
  const store = new SqliteConversationStore(":memory:");
  try {
    await assert.rejects(
      store.append("missing", "user", "Do not create a conversation"),
      (error: unknown) =>
        error instanceof DomainError && error.code === "NOT_FOUND",
    );
  } finally {
    store.close();
  }
});

test("SQLite conversation store returns the newest limited messages newest-first", async () => {
  const store = new SqliteConversationStore(":memory:");
  try {
    const conversation = await store.create();
    for (let index = 1; index <= 5; index += 1) {
      await store.append(conversation.id, "user", `message-${index}`);
    }

    const messages = await store.lastMessages(conversation.id, 2);
    assert.deepEqual(
      messages.map(({ content }) => content),
      ["message-5", "message-4"],
    );
    assert.deepEqual(await store.lastMessages(conversation.id, 0), []);
  } finally {
    store.close();
  }
});
