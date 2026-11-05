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
    await assert.rejects(
      store.getSummary("missing"),
      (error: unknown) =>
        error instanceof DomainError && error.code === "NOT_FOUND",
    );
    await assert.rejects(
      store.uncoveredDepartedMessages("missing", null),
      (error: unknown) =>
        error instanceof DomainError && error.code === "NOT_FOUND",
    );
    await assert.rejects(
      store.saveSummary("missing", "Brief", 1),
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

test("SQLite conversation store persists and replaces one summary per conversation", async () => {
  const store = new SqliteConversationStore(":memory:");
  try {
    const conversation = await store.create();
    const otherConversation = await store.create();
    const first = await store.append(conversation.id, "user", "First");
    const second = await store.append(conversation.id, "assistant", "Second");

    assert.equal(await store.getSummary(conversation.id), null);
    assert.deepEqual(
      await store.saveSummary(conversation.id, "Initial brief", first.id),
      { content: "Initial brief", coveredThroughMessageId: first.id },
    );
    assert.deepEqual(
      await store.saveSummary(conversation.id, "Updated brief", second.id),
      { content: "Updated brief", coveredThroughMessageId: second.id },
    );
    assert.deepEqual(await store.getSummary(conversation.id), {
      content: "Updated brief",
      coveredThroughMessageId: second.id,
    });
    assert.equal(await store.getSummary(otherConversation.id), null);

    const rowCount = store._db
      .prepare("SELECT COUNT(*) AS count FROM conversation_summaries")
      .get() as { count: number };
    assert.equal(rowCount.count, 1);
    store._db
      .prepare("DELETE FROM conversations WHERE id = ?")
      .run(conversation.id);
    const remainingRows = store._db
      .prepare("SELECT COUNT(*) AS count FROM conversation_summaries")
      .get() as { count: number };
    assert.equal(remainingRows.count, 0);
  } finally {
    store.close();
  }
});

test("SQLite conversation store rejects missing or cross-conversation coverage without replacing summary", async () => {
  const store = new SqliteConversationStore(":memory:");
  try {
    const conversation = await store.create();
    const otherConversation = await store.create();
    const message = await store.append(conversation.id, "user", "Covered");
    const otherMessage = await store.append(otherConversation.id, "user", "Other");
    await store.saveSummary(conversation.id, "Existing brief", message.id);

    await assert.rejects(
      store.saveSummary(conversation.id, "Invalid brief", otherMessage.id),
      (error: unknown) =>
        error instanceof DomainError && error.code === "VALIDATION",
    );
    await assert.rejects(
      store.saveSummary(conversation.id, "Missing brief", 999),
      (error: unknown) =>
        error instanceof DomainError && error.code === "VALIDATION",
    );
    assert.deepEqual(await store.getSummary(conversation.id), {
      content: "Existing brief",
      coveredThroughMessageId: message.id,
    });
  } finally {
    store.close();
  }
});

test("SQLite conversation store finds only oldest uncovered messages outside the recent eight", async () => {
  const store = new SqliteConversationStore(":memory:");
  try {
    const conversation = await store.create();
    const messages = [];
    for (let index = 1; index <= 18; index += 1) {
      messages.push(
        await store.append(conversation.id, "user", `message-${index}`),
      );
    }

    assert.deepEqual(
      (await store.uncoveredDepartedMessages(conversation.id, null)).map(
        ({ content }) => content,
      ),
      Array.from({ length: 10 }, (_, index) => `message-${index + 1}`),
    );
    assert.deepEqual(
      (
        await store.uncoveredDepartedMessages(
          conversation.id,
          messages[7].id,
        )
      ).map(({ content }) => content),
      ["message-9", "message-10"],
    );
    assert.deepEqual(
      await store.uncoveredDepartedMessages(
        conversation.id,
        messages[9].id,
      ),
      [],
    );
  } finally {
    store.close();
  }
});
