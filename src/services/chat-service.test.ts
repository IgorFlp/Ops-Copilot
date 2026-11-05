import assert from "node:assert/strict";
import test from "node:test";
import type {
  ChatStrategyInput,
  ModelTokenUsage,
  ReasoningStrategy,
  StrategyInput,
} from "../agents/types.js";
import type { ConversationSummarizer } from "../agents/conversation-summarizer.js";
import { createStrategyRegistry } from "../agent/index.js";
import { DomainError } from "../errors/domain-error.js";
import type {
  ConversationMessage,
  ConversationMessageRole,
  ConversationSummary,
  ConversationStore,
} from "../store/conversation-store.js";
import {
  createChatService,
  parseHistoryMessagesThreshold,
} from "./chat-service.js";

class FakeConversationStore implements ConversationStore {
  readonly events: string[] = [];
  readonly messages: ConversationMessage[] = [];
  readonly summaries = new Map<string, ConversationSummary>();
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

  async lastMessages(
    conversationId: string,
    limit: number,
  ): Promise<ConversationMessage[]> {
    this.events.push("lastMessages");
    if (this.missing || conversationId !== this.id) {
      throw new DomainError("Conversation not found", "NOT_FOUND");
    }
    return (limit === 0 ? [] : this.messages.slice(-limit)).reverse();
  }

  async getSummary(conversationId: string): Promise<ConversationSummary | null> {
    if (this.missing || conversationId !== this.id) {
      throw new DomainError("Conversation not found", "NOT_FOUND");
    }
    return this.summaries.get(conversationId) ?? null;
  }

  async saveSummary(
    conversationId: string,
    content: string,
    coveredThroughMessageId: number,
  ): Promise<ConversationSummary> {
    if (this.missing || conversationId !== this.id) {
      throw new DomainError("Conversation not found", "NOT_FOUND");
    }
    if (!this.messages.some(({ id }) => id === coveredThroughMessageId)) {
      throw new DomainError("Coverage message not found", "VALIDATION");
    }
    const summary = { content, coveredThroughMessageId };
    this.summaries.set(conversationId, summary);
    return summary;
  }

  async uncoveredDepartedMessages(
    conversationId: string,
    coveredThroughMessageId: number | null,
  ): Promise<ConversationMessage[]> {
    if (this.missing || conversationId !== this.id) {
      throw new DomainError("Conversation not found", "NOT_FOUND");
    }
    const departed =
      this.messages.length <= 8 ? [] : this.messages.slice(0, -8);
    return departed.filter(
      ({ id }) =>
        coveredThroughMessageId === null || id > coveredThroughMessageId,
    );
  }

  close(): void {}
}

function fakeStrategy(
  received: StrategyInput[],
  runError?: Error,
  tokenUsage?: ModelTokenUsage,
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
        ...(tokenUsage ? { tokenUsage } : {}),
      };
    },
  };
}

function chatInput(input: StrategyInput): ChatStrategyInput {
  if (typeof input === "string") {
    throw new TypeError("Expected structured chat strategy input");
  }
  return input;
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

test("chat service uses a fixed eight-message history window regardless of the configured threshold", async () => {
  const threshold = 2;
  for (const priorCount of [0, 1, 8, 11]) {
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

    const usedCount = Math.min(priorCount, 8);
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

test("chat metrics estimate each included context source and expose complete actual usage", async () => {
  const store = new FakeConversationStore();
  const conversation = await store.create();
  await store.append(conversation.id, "user", "abc");
  await store.append(conversation.id, "assistant", "defgh");
  const received: StrategyInput[] = [];
  const memoryService = {
    async recall() {
      return [
        {
          id: 1,
          userId: "operator-1",
          fact: "ijkl",
          createdAt: "2026-11-04T00:00:00.000Z",
          score: 0.9,
        },
        {
          id: 2,
          userId: "operator-1",
          fact: "mnopq",
          createdAt: "2026-11-04T00:00:00.000Z",
          score: 0.8,
        },
      ];
    },
  };
  const service = createChatService(
    store,
    createStrategyRegistry([
      fakeStrategy(received, undefined, { modelCalls: 2, promptTokens: 27 }),
    ]),
    { historyMessagesThreshold: 12, memoryService },
  );

  const result = await service.runChat({
    userId: "operator-1",
    message: "abcd",
    conversationId: conversation.id,
  });

  assert.deepEqual(result.metrics, {
    calls: 1,
    latencyMs: 1,
    historyMessages: 2,
    promptTokens: 27,
    contextBreakdown: {
      currentMessage: 1,
      history: 2,
      memories: 2,
    },
  });
  assert.equal("tokenUsage" in result, false);
});

test("chat omits actual usage when a strategy reports incomplete model usage", async () => {
  const service = createChatService(
    new FakeConversationStore(),
    createStrategyRegistry([
      fakeStrategy([], undefined, { modelCalls: 2 }),
    ]),
    { historyMessagesThreshold: 12 },
  );

  const result = await service.runChat({
    userId: "operator-1",
    message: "abc",
  });

  assert.equal("promptTokens" in result.metrics, false);
  assert.deepEqual(result.metrics.contextBreakdown, { currentMessage: 0 });
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

test("chat summarizes the oldest departed messages and supplies summary separately from the fixed recent window", async () => {
  const store = new FakeConversationStore();
  await store.create();
  for (let index = 1; index <= 18; index += 1) {
    await store.append(
      store.id,
      index % 2 === 0 ? "assistant" : "user",
      `message-${index}`,
    );
  }
  const received: StrategyInput[] = [];
  const summarizeInputs: Array<{
    previousSummary: string | null;
    messages: readonly { role: "user" | "assistant"; content: string }[];
  }> = [];
  const summarizer: ConversationSummarizer = {
    async summarize(input) {
      summarizeInputs.push(input);
      return {
        content: " Decision: drain one node; fact: EU; open: restart. ",
        promptTokens: 5,
      };
    },
  };
  const service = createChatService(
    store,
    createStrategyRegistry([
      fakeStrategy(received, undefined, { modelCalls: 1, promptTokens: 27 }),
    ]),
    { historyMessagesThreshold: 12, summarizer },
  );

  const result = await service.runChat({
    userId: "operator-1",
    message: "Continue the incident",
    conversationId: store.id,
  });

  assert.equal(summarizeInputs.length, 1);
  assert.equal(summarizeInputs[0].previousSummary, null);
  assert.deepEqual(
    summarizeInputs[0].messages.map(({ content }) => content),
    Array.from({ length: 8 }, (_, index) => `message-${index + 1}`),
  );
  const strategyInput = chatInput(received[0]);
  assert.equal(strategyInput.conversationSummary, summarizeInputs.length
    ? "Decision: drain one node; fact: EU; open: restart."
    : undefined);
  assert.deepEqual(
    strategyInput.history.map(({ content }) => content),
    Array.from({ length: 8 }, (_, index) => `message-${index + 11}`),
  );
  assert.deepEqual(result.trace.map(({ type, content }) => [type, content]), [
    ["summarize", "Decision: drain one node; fact: EU; open: restart."],
    ["answer", "A deterministic answer"],
  ]);
  assert.equal(result.metrics.historyMessages, 8);
  assert.equal(
    result.metrics.contextBreakdown.summary,
    Math.floor("Decision: drain one node; fact: EU; open: restart.".length / 4),
  );
  assert.equal(result.metrics.promptTokens, 32);
  assert.deepEqual(store.summaries.get(store.id), {
    content: "Decision: drain one node; fact: EU; open: restart.",
    coveredThroughMessageId: 8,
  });
});

test("chat reuses an incomplete summary batch and merges exactly eight newly departed messages", async () => {
  const noBatchStore = new FakeConversationStore();
  await noBatchStore.create();
  for (let index = 1; index <= 23; index += 1) {
    await noBatchStore.append(noBatchStore.id, "user", `message-${index}`);
  }
  await noBatchStore.saveSummary(noBatchStore.id, "Previous brief", 8);
  let noBatchCalls = 0;
  const noBatchService = createChatService(
    noBatchStore,
    createStrategyRegistry([fakeStrategy([])]),
    {
      historyMessagesThreshold: 12,
      summarizer: {
        async summarize() {
          noBatchCalls += 1;
          return { content: "Should not run" };
        },
      },
    },
  );

  const reuseResult = await noBatchService.runChat({
    userId: "operator-1",
    message: "Reuse it",
    conversationId: noBatchStore.id,
  });
  assert.equal(noBatchCalls, 0);
  assert.equal(
    reuseResult.trace.some(({ type }) => type === "summarize"),
    false,
  );
  assert.equal(
    noBatchStore.messages.length,
    25,
    "the reuse turn should persist only its user and assistant messages",
  );
  assert.deepEqual(noBatchStore.summaries.get(noBatchStore.id), {
    content: "Previous brief",
    coveredThroughMessageId: 8,
  });

  const batchStore = new FakeConversationStore();
  await batchStore.create();
  for (let index = 1; index <= 24; index += 1) {
    await batchStore.append(batchStore.id, "user", `message-${index}`);
  }
  await batchStore.saveSummary(batchStore.id, "Previous brief", 8);
  const inputs: Array<{
    previousSummary: string | null;
    messages: readonly { role: "user" | "assistant"; content: string }[];
  }> = [];
  const service = createChatService(
    batchStore,
    createStrategyRegistry([fakeStrategy([])]),
    {
      historyMessagesThreshold: 12,
      summarizer: {
        async summarize(input) {
          inputs.push(input);
          return { content: "Merged brief" };
        },
      },
    },
  );

  await service.runChat({
    userId: "operator-1",
    message: "Refresh it",
    conversationId: batchStore.id,
  });
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].previousSummary, "Previous brief");
  assert.deepEqual(
    inputs[0].messages.map(({ content }) => content),
    Array.from({ length: 8 }, (_, index) => `message-${index + 9}`),
  );
  assert.deepEqual(batchStore.summaries.get(batchStore.id), {
    content: "Merged brief",
    coveredThroughMessageId: 16,
  });
});

test("chat emits one summarize event per saved catch-up batch in oldest-first order", async () => {
  const store = new FakeConversationStore();
  await store.create();
  for (let index = 1; index <= 32; index += 1) {
    await store.append(store.id, "user", `message-${index}`);
  }
  await store.saveSummary(store.id, "Previous brief", 8);
  let call = 0;
  const service = createChatService(
    store,
    createStrategyRegistry([fakeStrategy([])]),
    {
      historyMessagesThreshold: 12,
      summarizer: {
        async summarize() {
          call += 1;
          return { content: `Merged brief ${call}` };
        },
      },
    },
  );

  const result = await service.runChat({
    userId: "operator-1",
    message: "Continue",
    conversationId: store.id,
  });

  assert.deepEqual(
    result.trace.filter(({ type }) => type === "summarize").map(({ content }) => content),
    ["Merged brief 1", "Merged brief 2"],
  );
  assert.deepEqual(store.summaries.get(store.id), {
    content: "Merged brief 2",
    coveredThroughMessageId: 24,
  });
});

test("chat catches up oldest-first through overdue batches and retains earlier saves on later rejection", async () => {
  const store = new FakeConversationStore();
  await store.create();
  for (let index = 1; index <= 32; index += 1) {
    await store.append(store.id, "user", `message-${index}`);
  }
  await store.saveSummary(store.id, "Previous brief", 8);
  const inputs: Array<{
    previousSummary: string | null;
    messages: readonly { role: "user" | "assistant"; content: string }[];
  }> = [];
  const service = createChatService(
    store,
    createStrategyRegistry([fakeStrategy([])]),
    {
      historyMessagesThreshold: 12,
      summarizer: {
        async summarize(input) {
          inputs.push(input);
          if (inputs.length === 2) {
            return { content: "x".repeat(804) };
          }
          return { content: "First merged brief" };
        },
      },
    },
  );

  await assert.rejects(
    service.runChat({
      userId: "operator-1",
      message: "Continue",
      conversationId: store.id,
    }),
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === "INTERNAL" &&
      !error.message.includes("x".repeat(10)),
  );
  assert.equal(inputs.length, 2);
  assert.deepEqual(
    inputs[0].messages.map(({ content }) => content),
    Array.from({ length: 8 }, (_, index) => `message-${index + 9}`),
  );
  assert.equal(inputs[1].previousSummary, "First merged brief");
  assert.deepEqual(
    inputs[1].messages.map(({ content }) => content),
    Array.from({ length: 8 }, (_, index) => `message-${index + 17}`),
  );
  assert.deepEqual(store.summaries.get(store.id), {
    content: "First merged brief",
    coveredThroughMessageId: 16,
  });
  assert.equal(store.messages.length, 32);
});

test("chat rejects an empty summary and leaves the current user message unappended", async () => {
  const store = new FakeConversationStore();
  await store.create();
  for (let index = 1; index <= 16; index += 1) {
    await store.append(store.id, "user", `message-${index}`);
  }
  const service = createChatService(
    store,
    createStrategyRegistry([fakeStrategy([])]),
    {
      historyMessagesThreshold: 12,
      summarizer: {
        async summarize() {
          return { content: "   " };
        },
      },
    },
  );

  await assert.rejects(
    service.runChat({
      userId: "operator-1",
      message: "Must not be stored",
      conversationId: store.id,
    }),
    (error: unknown) =>
      error instanceof DomainError && error.code === "INTERNAL",
  );
  assert.equal(store.messages.length, 16);
  assert.equal(store.summaries.has(store.id), false);
});
