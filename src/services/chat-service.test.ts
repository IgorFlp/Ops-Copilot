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
  failAssistantAppend = false;

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
    if (role === "assistant" && this.failAssistantAppend) {
      throw new Error("assistant persistence failed");
    }
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

  const result = await service.runChat({
    userId: "operator-1",
    message: "Check alerts",
  });

  assert.equal(result.conversationId, store.id);
  assert.deepEqual(store.events, [
    "create",
    "lastMessages",
    "append:user",
    "append:assistant",
  ]);
  assert.deepEqual(received, [{
    userId: "operator-1",
    message: "Check alerts",
    history: [],
  }]);
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
      userId: "operator-1",
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

  await assert.rejects(
    service.runChat({ userId: "operator-1", message: "Fail" }),
  );
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
      userId: "operator-1",
      message: "current request",
      conversationId: store.id,
    });

    const usedCount = Math.min(priorCount, threshold);
    const firstUsed = priorCount - usedCount + 1;
    assert.deepEqual(received, [{
      userId: "operator-1",
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

test("chat service recalls scoped facts and passes them separately from history", async () => {
  const store = new FakeConversationStore();
  const conversation = await store.create();
  await store.append(conversation.id, "user", "Earlier question");
  await store.append(conversation.id, "assistant", "Earlier answer");
  const received: StrategyInput[] = [];
  const memoryService = {
    async recall(userId: string, query: string) {
      assert.equal(userId, "operator-1");
      assert.equal(query, "Where is the service hosted?");
      return [{
        id: 1,
        userId,
        fact: "The production service runs in Frankfurt.",
        createdAt: "2026-11-04T00:00:00.000Z",
        score: 0.81,
      }];
    },
  };
  const service = createChatService(
    store,
    createStrategyRegistry([fakeStrategy(received)]),
    { historyMessagesThreshold: 12, memoryService },
  );

  const result = await service.runChat({
    userId: "operator-1",
    message: "Where is the service hosted?",
    conversationId: conversation.id,
  });

  assert.deepEqual(received, [{
    userId: "operator-1",
    message: "Where is the service hosted?",
    history: [
      { role: "user", content: "Earlier question" },
      { role: "assistant", content: "Earlier answer" },
    ],
    memoryFacts: ["The production service runs in Frankfurt."],
  }]);
  assert.equal(result.metrics.historyMessages, 2);
});

test("chat returns before scheduled post-response learning completes", async () => {
  const store = new FakeConversationStore();
  const received: StrategyInput[] = [];
  const scheduled: Array<() => Promise<void>> = [];
  let releaseLearning!: () => void;
  const learningGate = new Promise<void>((resolve) => {
    releaseLearning = resolve;
  });
  let learningFinished = false;
  const service = createChatService(
    store,
    createStrategyRegistry([fakeStrategy(received)]),
    {
      historyMessagesThreshold: 12,
      learningService: {
        async learn(userId, message) {
          assert.equal(userId, "operator-1");
          assert.equal(message, "I prefer concise incident summaries.");
          await learningGate;
          learningFinished = true;
        },
      },
      learningTasks: {
        schedule(task) {
          scheduled.push(task);
        },
      },
    },
  );

  const result = await service.runChat({
    userId: "operator-1",
    message: "I prefer concise incident summaries.",
  });

  assert.equal(result.answer, "A deterministic answer");
  assert.deepEqual(store.events.slice(-2), ["append:user", "append:assistant"]);
  assert.equal(scheduled.length, 1);
  assert.equal(learningFinished, false);
  const learning = scheduled[0]();
  releaseLearning();
  await learning;
  assert.equal(learningFinished, true);
});

test("chat does not schedule learning when strategy execution fails", async () => {
  const store = new FakeConversationStore();
  let scheduled = 0;
  const service = createChatService(
    store,
    createStrategyRegistry([
      fakeStrategy([], new Error("provider detail")),
    ]),
    {
      historyMessagesThreshold: 12,
      learningService: { async learn() {} },
      learningTasks: {
        schedule() {
          scheduled += 1;
        },
      },
    },
  );

  await assert.rejects(
    service.runChat({ userId: "operator-1", message: "A durable preference" }),
  );
  assert.equal(scheduled, 0);
});

test("chat does not schedule learning when assistant persistence fails", async () => {
  const store = new FakeConversationStore();
  store.failAssistantAppend = true;
  let scheduled = 0;
  const service = createChatService(
    store,
    createStrategyRegistry([fakeStrategy([])]),
    {
      historyMessagesThreshold: 12,
      learningService: { async learn() {} },
      learningTasks: {
        schedule() {
          scheduled += 1;
        },
      },
    },
  );

  await assert.rejects(
    service.runChat({ userId: "operator-1", message: "I prefer concise reports." }),
  );
  assert.equal(scheduled, 0);
});

test("chat asks for clarification on an ambiguous correction before running strategy", async () => {
  const store = new FakeConversationStore();
  const received: StrategyInput[] = [];
  let scheduled = 0;
  const service = createChatService(
    store,
    createStrategyRegistry([fakeStrategy(received)]),
    {
      historyMessagesThreshold: 12,
      learningService: {
        async prepareCorrection(userId, message) {
          assert.equal(userId, "operator-1");
          assert.equal(message, "Correction: I prefer the other format.");
          return { kind: "ambiguous" };
        },
        async learn() {
          throw new Error("ambiguous corrections must not be learned");
        },
      },
      learningTasks: {
        schedule() {
          scheduled += 1;
        },
      },
    },
  );

  const result = await service.runChat({
    userId: "operator-1",
    message: "Correction: I prefer the other format.",
  });

  assert.match(result.answer, /Could you clarify which fact or preference/);
  assert.equal(result.metrics.calls, 0);
  assert.deepEqual(received, []);
  assert.deepEqual(store.messages.map(({ role }) => role), [
    "user",
    "assistant",
  ]);
  assert.equal(scheduled, 0);
});

test("chat defers a prepared correction until the assistant response is persisted", async () => {
  const store = new FakeConversationStore();
  const scheduled: Array<() => Promise<void>> = [];
  const preparedCorrection = {
    kind: "replace" as const,
    memoryId: 7,
    fact: "The operator prefers detailed reports.",
  };
  const service = createChatService(
    store,
    createStrategyRegistry([fakeStrategy([])]),
    {
      historyMessagesThreshold: 12,
      learningService: {
        async prepareCorrection() {
          return preparedCorrection;
        },
        async learn(userId, message, correction) {
          assert.equal(userId, "operator-1");
          assert.equal(message, "Correction: I prefer detailed reports.");
          assert.deepEqual(correction, preparedCorrection);
        },
      },
      learningTasks: {
        schedule(task) {
          assert.deepEqual(store.events.slice(-2), [
            "append:user",
            "append:assistant",
          ]);
          scheduled.push(task);
        },
      },
    },
  );

  const result = await service.runChat({
    userId: "operator-1",
    message: "Correction: I prefer detailed reports.",
  });
  assert.equal(result.answer, "A deterministic answer");
  assert.equal(scheduled.length, 1);
  await scheduled[0]();
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
