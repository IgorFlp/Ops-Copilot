import assert from "node:assert/strict";
import test from "node:test";
import type { ReasoningStrategy, StrategyInput } from "../agents/types.js";
import { createStrategyRegistry } from "../agent/index.js";
import { DomainError } from "../errors/domain-error.js";
import type {
  ConversationMessage,
  ConversationMessageRole,
  ConversationStore,
} from "../store/conversation-store.js";
import {
  createChatService,
  parseHistoryMessagesThreshold,
} from "./chat-service.js";

class FakeConversationStore implements ConversationStore {
  readonly events: string[] = [];
  readonly messages: ConversationMessage[] = [];
  readonly id = "conversation-1";
  private nextMessageId = 1;
  missing = false;

  async create() {
    this.events.push("create");
    return { id: this.id, createdAt: "2026-11-04T00:00:00.000Z" };
  }

  async append(
    conversationId: string,
    role: ConversationMessageRole,
    content: string,
  ): Promise<ConversationMessage> {
    this.events.push(`append:${role}`);
    if (this.missing || conversationId !== this.id) {
      throw new DomainError("Conversation not found", "NOT_FOUND");
    }
    const message = {
      id: this.nextMessageId++,
      conversationId,
      role,
      content,
      createdAt: "2026-11-04T00:00:00.000Z",
    };
    this.messages.push(message);
    return message;
  }

  async lastMessages(conversationId: string): Promise<ConversationMessage[]> {
    this.events.push("lastMessages");
    if (this.missing || conversationId !== this.id) {
      throw new DomainError("Conversation not found", "NOT_FOUND");
    }
    return [...this.messages].reverse();
  }

  close(): void {}
}

function fakeStrategy(
  received: StrategyInput[],
  runError?: Error,
): ReasoningStrategy {
  return {
    name: "react",
    async run(input) {
      received.push(input);
      if (runError) throw runError;
      return {
        answer: "A deterministic answer",
        trace: [{ type: "answer", content: "A deterministic answer" }],
        metrics: { calls: 1, latencyMs: 1 },
      };
    },
  };
}

test("chat service creates, runs, and persists a new conversation", async () => {
  const store = new FakeConversationStore();
  const received: StrategyInput[] = [];
  const service = createChatService(
    store,
    createStrategyRegistry([fakeStrategy(received)]),
    { historyMessagesThreshold: 12 },
  );

  const result = await service.runChat({ message: "Check alerts" });

  assert.equal(result.conversationId, store.id);
  assert.deepEqual(store.events, [
    "create",
    "lastMessages",
    "append:user",
    "append:assistant",
  ]);
  assert.deepEqual(received, [{ message: "Check alerts", history: [] }]);
  assert.deepEqual(store.messages.map(({ role }) => role), [
    "user",
    "assistant",
  ]);
});

test("chat service reuses a conversation and does not create one for an unknown id", async () => {
  const store = new FakeConversationStore();
  store.missing = true;
  const received: StrategyInput[] = [];
  const service = createChatService(
    store,
    createStrategyRegistry([fakeStrategy(received)]),
    { historyMessagesThreshold: 12 },
  );

  await assert.rejects(
    service.runChat({
      message: "Follow up",
      conversationId: store.id,
    }),
    (error: unknown) =>
      error instanceof DomainError && error.code === "NOT_FOUND",
  );
  assert.deepEqual(store.events, ["lastMessages"]);
  assert.equal(received.length, 0);
});

test("chat service does not persist an assistant message when strategy fails", async () => {
  const store = new FakeConversationStore();
  const received: StrategyInput[] = [];
  const service = createChatService(
    store,
    createStrategyRegistry([
      fakeStrategy(received, new Error("provider detail")),
    ]),
    { historyMessagesThreshold: 12 },
  );

  await assert.rejects(service.runChat({ message: "Fail" }));
  assert.deepEqual(store.messages.map(({ role }) => role), ["user"]);
});

test("chat service composes empty, partial, exact, and capped history", async () => {
  const threshold = 2;
  for (const priorCount of [0, 1, threshold, threshold + 3]) {
    const store = new FakeConversationStore();
    await store.create();
    for (let index = 1; index <= priorCount; index += 1) {
      await store.append(
        store.id,
        index % 2 === 0 ? "assistant" : "user",
        `message-${index}`,
      );
    }

    const received: StrategyInput[] = [];
    const service = createChatService(
      store,
      createStrategyRegistry([fakeStrategy(received)]),
      { historyMessagesThreshold: threshold },
    );

    const result = await service.runChat({
      message: "current request",
      conversationId: store.id,
    });

    const usedCount = Math.min(priorCount, threshold);
    const firstUsed = priorCount - usedCount + 1;
    assert.deepEqual(received, [{
      message: "current request",
      history: Array.from({ length: usedCount }, (_, index) => {
        const messageNumber = firstUsed + index;
        return {
          role: messageNumber % 2 === 0 ? "assistant" : "user",
          content: `message-${messageNumber}`,
        };
      }),
    }]);
    assert.equal(result.metrics.historyMessages, usedCount);
  }
});

test("history threshold defaults to 12 and rejects invalid configured values", () => {
  assert.equal(parseHistoryMessagesThreshold(undefined), 12);
  assert.equal(parseHistoryMessagesThreshold("2"), 2);
  for (const value of ["", "0", "-1", "1.5", "not-a-number", "9007199254740992"]) {
    assert.throws(
      () => parseHistoryMessagesThreshold(value),
      (error: unknown) =>
        error instanceof DomainError && error.code === "CONFIGURATION",
    );
  }
});
