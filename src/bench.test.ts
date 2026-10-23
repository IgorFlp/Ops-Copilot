import assert from "node:assert/strict";
import test from "node:test";
import {
  BenchmarkResult,
  BenchmarkState,
  checkScenarioAccuracy,
  createdIncidentIdsToCleanup,
  formatBenchResults,
  parseBenchArguments,
} from "./bench.js";

function state(overrides: Partial<BenchmarkState> = {}): BenchmarkState {
  return {
    alerts: [
      {
        id: 1,
        serviceId: 10,
        serviceSlug: "payments-api",
        title: "Payment latency",
        status: "firing",
        severity: "critical",
        createdAt: "2026-10-22T10:00:00.000Z",
      },
      {
        id: 2,
        serviceId: 11,
        serviceSlug: "checkout-api",
        title: "Checkout errors",
        status: "firing",
        severity: "critical",
        createdAt: "2026-10-22T10:01:00.000Z",
      },
      {
        id: 3,
        serviceId: 12,
        serviceSlug: "orders-api",
        title: "Order queue",
        status: "firing",
        severity: "high",
        createdAt: "2026-10-22T10:02:00.000Z",
      },
    ],
    incidents: [],
    ...overrides,
  };
}

test("bench CLI defaults to all scenarios and parses the two flags", () => {
  assert.deepEqual(parseBenchArguments([]), {
    scenario: undefined,
    noReplanner: false,
  });
  assert.deepEqual(
    parseBenchArguments(["--scenario", "C2", "--no-replanner"]),
    { scenario: "C2", noReplanner: true },
  );
  assert.deepEqual(parseBenchArguments(["C3"], { scenario: "true" }), {
    scenario: "C3",
    noReplanner: false,
  });
  assert.deepEqual(parseBenchArguments([], { noReplanner: "true" }), {
    scenario: undefined,
    noReplanner: true,
  });
  assert.throws(
    () => parseBenchArguments(["--scenario", "C4"]),
    /Unknown scenario/,
  );
  assert.throws(
    () => parseBenchArguments(["--no-replanner", "--no-replanner"]),
    /Duplicate option/,
  );
});

test("C1 accuracy is checked against the persisted critical firing count", () => {
  const snapshot = state();
  assert.equal(
    checkScenarioAccuracy("C1", "There are 2 critical alerts firing.", snapshot, snapshot, "run-C1-", []),
    true,
  );
  assert.equal(
    checkScenarioAccuracy("C1", "There are 3 critical alerts firing.", snapshot, snapshot, "run-C1-", []),
    false,
  );
});

test("C2 accuracy requires ordered SEV-2 incidents and first-resolution state", () => {
  const before = state();
  const titles = [
    "run-C2-checkout",
    "run-C2-payment",
    "run-C2-catalog",
  ];
  const after = state({
    incidents: [
      { id: 41, title: titles[0], serviceSlug: "checkout-api", severity: "high", status: "resolved" },
      { id: 42, title: titles[1], serviceSlug: "payments-api", severity: "high", status: "open" },
      { id: 43, title: titles[2], serviceSlug: "catalog-api", severity: "high", status: "open" },
    ],
  });

  assert.equal(checkScenarioAccuracy("C2", "", before, after, "run-C2-", titles), true);
  const wrongOrder = state({
    incidents: [
      { id: 41, title: titles[0], serviceSlug: "payments-api", severity: "high", status: "resolved" },
      { id: 42, title: titles[1], serviceSlug: "checkout-api", severity: "high", status: "open" },
      { id: 43, title: titles[2], serviceSlug: "catalog-api", severity: "high", status: "open" },
    ],
  });
  assert.equal(checkScenarioAccuracy("C2", "", before, wrongOrder, "run-C2-", titles), false);
});

test("C3 selects the oldest firing alert, validates its incident, and counts the others", () => {
  const before = state();
  const title = "run-C3-oldest";
  const after = state({
    incidents: [
      { id: 51, title, serviceSlug: "payments-api", severity: "critical", status: "open" },
    ],
  });

  assert.equal(
    checkScenarioAccuracy("C3", "2 alertas sobraram.", before, after, "run-C3-", [title]),
    true,
  );
  assert.equal(
    checkScenarioAccuracy("C3", "3 alertas sobraram.", before, after, "run-C3-", [title]),
    false,
  );
  assert.equal(
    checkScenarioAccuracy(
      "C3",
      "Havia 2 alertas disparando no início; sobraram 3.",
      before,
      after,
      "run-C3-",
      [title],
    ),
    false,
  );
});

test("benchmark cleanup selects only new incidents with the current run prefix", () => {
  const before = state({
    incidents: [
      { id: 7, title: "run-existing", serviceSlug: "payments-api", severity: "high", status: "open" },
    ],
  });
  const after = state({
    incidents: [
      ...before.incidents,
      { id: 8, title: "run-new-1", serviceSlug: "checkout-api", severity: "high", status: "open" },
      { id: 9, title: "unrelated", serviceSlug: "catalog-api", severity: "low", status: "open" },
    ],
  });

  assert.deepEqual(createdIncidentIdsToCleanup(before, after, "run-"), [8]);
});

test("benchmark table includes accuracy and both metrics", () => {
  const results: BenchmarkResult[] = [
    {
      scenario: "C1",
      strategy: "react",
      accuracy: true,
      llmCalls: 2,
      latencyMs: 25,
    },
  ];
  const output = formatBenchResults(results);

  assert.match(output, /Cenário\s+\|\s+Estratégia\s+\|\s+Acerto\s+\|\s+LLMCalls\s+\|\s+latencyMs/);
  assert.match(output, /C1\s+\|\s+react\s+\|\s+SIM\s+\|\s+2\s+\|\s+25/);
});
