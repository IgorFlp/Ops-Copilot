import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { createProductionGraph } from "../agent/production-graph.js";
import type { ChatStrategyInput, AttributedTraceEvent } from "../agents/types.js";
import { DomainError } from "../errors/domain-error.js";

describe("Production Graph", () => {
  let originalCreateModel: any;

  before(async () => {
    const modelModule = await import("../agents/model.js");
    originalCreateModel = modelModule.createModel;
  });

  after(() => {
    // Restore original if needed
  });

  function createMockModel(routeResponse: { route: string; reason: string }) {
    return {
      withStructuredOutput: () => ({
        invoke: async () => ({
          parsed: routeResponse,
          raw: { usage_metadata: { prompt_tokens: 100 } },
        }),
      }),
    } as any;
  }

  function createMockStrategy(name: string) {
    return {
      name,
      run: async (input: ChatStrategyInput) => ({
        answer: `Answer from ${name}`,
        trace: [
          { type: "action" as const, content: `Action from ${name}`, tools: ["list_alerts"] },
          { type: "observation" as const, content: `Observation from ${name}` },
          { type: "answer" as const, content: `Answer from ${name}` },
        ],
        metrics: { calls: 2, latencyMs: 100 },
        tokenUsage: { modelCalls: 2, promptTokens: 200 },
      }),
    };
  }

  describe("automatic routing", () => {
    test("selects react for simple lookup query", async () => {
      const mockRouteResponse = { route: "react", reason: "Simple lookup query" };
      const graph = await createProductionGraph(new Map([
        ["react", createMockStrategy("react")],
        ["plan-and-execute", createMockStrategy("plan-and-execute")],
        ["reflect:react", createMockStrategy("reflect:react")],
      ]));

      // Mock the model creation
      const modelModule = await import("../agents/model.js");
      modelModule.createModel = () => createMockModel(mockRouteResponse);

      const input: ChatStrategyInput = {
        userId: "user-1",
        message: "List all critical alerts",
        history: [],
      };

      const result = await graph.invoke({
        input,
        selectionSource: "auto",
      });

      // Restore
      modelModule.createModel = originalCreateModel;

      assert.ok(result.strategyResult);
      assert.strictEqual(result.strategyResult.answer, "Answer from react");
      assert.ok(result.trace.some((e: AttributedTraceEvent) => e.node === "context"));
      assert.ok(result.trace.some((e: AttributedTraceEvent) => e.node === "route" && e.content.includes("react")));
      assert.ok(result.trace.some((e: AttributedTraceEvent) => e.node === "react"));
    });

    test("selects plan-and-execute for multi-step task", async () => {
      const mockRouteResponse = { route: "plan-and-execute", reason: "Multi-step operational task" };
      const graph = await createProductionGraph(new Map([
        ["react", createMockStrategy("react")],
        ["plan-and-execute", createMockStrategy("plan-and-execute")],
        ["reflect:react", createMockStrategy("reflect:react")],
      ]));

      const modelModule = await import("../agents/model.js");
      modelModule.createModel = () => createMockModel(mockRouteResponse);

      const input: ChatStrategyInput = {
        userId: "user-1",
        message: "Create a plan to resolve the checkout incident and open a new incident",
        history: [],
      };

      const result = await graph.invoke({
        input,
        selectionSource: "auto",
      });

      modelModule.createModel = originalCreateModel;

      assert.ok(result.strategyResult);
      assert.strictEqual(result.strategyResult.answer, "Answer from plan-and-execute");
      assert.ok(result.trace.some((e: AttributedTraceEvent) => e.node === "route" && e.content.includes("plan-and-execute")));
      assert.ok(result.trace.some((e: AttributedTraceEvent) => e.node === "plan-and-execute"));
    });

    test("selects reflect:react for complex analysis", async () => {
      const mockRouteResponse = { route: "reflect:react", reason: "Complex analysis requiring reflection" };
      const graph = await createProductionGraph(new Map([
        ["react", createMockStrategy("react")],
        ["plan-and-execute", createMockStrategy("plan-and-execute")],
        ["reflect:react", createMockStrategy("reflect:react")],
      ]));

      const modelModule = await import("../agents/model.js");
      modelModule.createModel = () => createMockModel(mockRouteResponse);

      const input: ChatStrategyInput = {
        userId: "user-1",
        message: "Analyze the root cause of the recurring checkout failures and provide a detailed remediation plan",
        history: [],
      };

      const result = await graph.invoke({
        input,
        selectionSource: "auto",
      });

      modelModule.createModel = originalCreateModel;

      assert.ok(result.strategyResult);
      assert.strictEqual(result.strategyResult.answer, "Answer from reflect:react");
      assert.ok(result.trace.some((e: AttributedTraceEvent) => e.node === "route" && e.content.includes("reflect:react")));
      assert.ok(result.trace.some((e: AttributedTraceEvent) => e.node === "reflect:react"));
    });
  });

  describe("router validation", () => {
    test("rejects invalid route with UNSUPPORTED_STRATEGY", async () => {
      const mockRouteResponse = { route: "invalid-strategy", reason: "Some reason" };
      const graph = await createProductionGraph(new Map([
        ["react", createMockStrategy("react")],
        ["plan-and-execute", createMockStrategy("plan-and-execute")],
        ["reflect:react", createMockStrategy("reflect:react")],
      ]));

      const modelModule = await import("../agents/model.js");
      modelModule.createModel = () => createMockModel(mockRouteResponse);

      const input: ChatStrategyInput = {
        userId: "user-1",
        message: "Test",
        history: [],
      };

      let error: Error | null = null;
      try {
        await graph.invoke({ input, selectionSource: "auto" });
      } catch (e: unknown) {
        error = e as Error;
      }

      modelModule.createModel = originalCreateModel;

      assert.ok(error);
      assert.ok(error instanceof DomainError);
      assert.strictEqual((error as DomainError).code, "UNSUPPORTED_STRATEGY");
    });

    test("rejects empty reason with UNSUPPORTED_STRATEGY", async () => {
      const mockRouteResponse = { route: "react", reason: "   " };
      const graph = await createProductionGraph(new Map([
        ["react", createMockStrategy("react")],
        ["plan-and-execute", createMockStrategy("plan-and-execute")],
        ["reflect:react", createMockStrategy("reflect:react")],
      ]));

      const modelModule = await import("../agents/model.js");
      modelModule.createModel = () => createMockModel(mockRouteResponse);

      const input: ChatStrategyInput = {
        userId: "user-1",
        message: "Test",
        history: [],
      };

      let error: Error | null = null;
      try {
        await graph.invoke({ input, selectionSource: "auto" });
      } catch (e: unknown) {
        error = e as Error;
      }

      modelModule.createModel = originalCreateModel;

      assert.ok(error);
      assert.ok(error instanceof DomainError);
      assert.strictEqual((error as DomainError).code, "UNSUPPORTED_STRATEGY");
    });
  });

  describe("trace node attribution", () => {
    test("every trace event has node field", async () => {
      const mockRouteResponse = { route: "react", reason: "Simple query" };
      const graph = await createProductionGraph(new Map([
        ["react", createMockStrategy("react")],
        ["plan-and-execute", createMockStrategy("plan-and-execute")],
        ["reflect:react", createMockStrategy("reflect:react")],
      ]));

      const modelModule = await import("../agents/model.js");
      modelModule.createModel = () => createMockModel(mockRouteResponse);

      const input: ChatStrategyInput = {
        userId: "user-1",
        message: "List alerts",
        history: [],
      };

      const result = await graph.invoke({ input, selectionSource: "auto" });

      modelModule.createModel = originalCreateModel;

      for (const event of result.trace) {
        assert.ok(event.node, `Event missing node: ${JSON.stringify(event)}`);
        assert.ok(["context", "route", "react", "plan-and-execute", "reflect:react", "summary"].includes(event.node));
      }
    });

    test("route event includes route and reason in content", async () => {
      const mockRouteResponse = { route: "plan-and-execute", reason: "Multi-step task" };
      const graph = await createProductionGraph(new Map([
        ["react", createMockStrategy("react")],
        ["plan-and-execute", createMockStrategy("plan-and-execute")],
        ["reflect:react", createMockStrategy("reflect:react")],
      ]));

      const modelModule = await import("../agents/model.js");
      modelModule.createModel = () => createMockModel(mockRouteResponse);

      const input: ChatStrategyInput = {
        userId: "user-1",
        message: "Create plan",
        history: [],
      };

      const result = await graph.invoke({ input, selectionSource: "auto" });

      modelModule.createModel = originalCreateModel;

      const routeEvent = result.trace.find((e: AttributedTraceEvent) => e.node === "route");
      assert.ok(routeEvent);
      const content = JSON.parse(routeEvent.content);
      assert.strictEqual(content.route, "plan-and-execute");
      assert.strictEqual(content.reason, "Multi-step task");
    });
  });

  describe("explicit strategy override", () => {
    test("bypasses router when strategy is provided", async () => {
      const graph = await createProductionGraph(new Map([
        ["react", createMockStrategy("react")],
        ["plan-and-execute", createMockStrategy("plan-and-execute")],
        ["reflect:react", createMockStrategy("reflect:react")],
      ]));

      const input: ChatStrategyInput = {
        userId: "user-1",
        message: "Create a plan",
        history: [],
      };

      const result = await graph.invoke({
        input,
        selectionSource: "override",
        selectedStrategy: "plan-and-execute",
      });

      assert.ok(result.strategyResult);
      assert.strictEqual(result.strategyResult.answer, "Answer from plan-and-execute");
      // Should not have route event from router
      const routeEvents = result.trace.filter((e: AttributedTraceEvent) => e.node === "route");
      assert.ok(routeEvents.some((e: AttributedTraceEvent) => e.content.includes("Explicit override: plan-and-execute")));
      assert.ok(result.trace.some((e: AttributedTraceEvent) => e.node === "plan-and-execute"));
    });

    test("uses reflect:react when reflect flag is set without strategy", async () => {
      const graph = await createProductionGraph(new Map([
        ["react", createMockStrategy("react")],
        ["plan-and-execute", createMockStrategy("plan-and-execute")],
        ["reflect:react", createMockStrategy("reflect:react")],
      ]));

      const input: ChatStrategyInput = {
        userId: "user-1",
        message: "Analyze this",
        history: [],
      };

      const result = await graph.invoke({
        input,
        selectionSource: "reflect",
      });

      assert.ok(result.strategyResult);
      assert.strictEqual(result.strategyResult.answer, "Answer from reflect:react");
      const routeEvents = result.trace.filter((e: AttributedTraceEvent) => e.node === "route");
      assert.ok(routeEvents.some((e: AttributedTraceEvent) => e.content.includes("Legacy reflect flag enabled")));
      assert.ok(result.trace.some((e: AttributedTraceEvent) => e.node === "reflect:react"));
    });
  });

  describe("context preparation", () => {
    test("context prepared once and passed to both router and strategy", async () => {
      const mockRouteResponse = { route: "react", reason: "Test" };
      const graph = await createProductionGraph(new Map([
        ["react", createMockStrategy("react")],
        ["plan-and-execute", createMockStrategy("plan-and-execute")],
        ["reflect:react", createMockStrategy("reflect:react")],
      ]));

      const modelModule = await import("../agents/model.js");
      modelModule.createModel = () => createMockModel(mockRouteResponse);

      const input: ChatStrategyInput = {
        userId: "user-1",
        message: "Test message with history",
        history: [
          { role: "user", content: "Previous message" },
          { role: "assistant", content: "Previous response" },
        ],
      };

      const result = await graph.invoke({ input, selectionSource: "auto" });

      modelModule.createModel = originalCreateModel;

      assert.ok(result.trace.some((e: AttributedTraceEvent) => e.node === "context"));
      assert.ok(result.trace.some((e: AttributedTraceEvent) => e.node === "route"));
      assert.ok(result.trace.some((e: AttributedTraceEvent) => e.node === "react"));
    });
  });
});