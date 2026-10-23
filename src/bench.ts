import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DomainError } from "./errors/domain-error.js";
import { Alert } from "./models/alert.js";
import type { AlertSeverity, AlertStatus } from "./models/alert.js";
import { closeDatabase } from "./models/database.js";
import { Incident } from "./models/incident.js";
import { Service } from "./models/service.js";
import { seedOperationalDatabase } from "../scripts/seed.js";
import { planAndExecuteStrategy } from "./agents/plan-and-execute.js";
import { reactStrategy } from "./agents/react.js";
import type { ReasoningResult, ReasoningStrategy } from "./agents/types.js";

export type BenchmarkScenarioId = "C1" | "C2" | "C3";
export type BenchmarkStrategyName = "react" | "plan-and-execute";
export type BenchmarkAlertStatus = AlertStatus;
export type BenchmarkSeverity = AlertSeverity;

export interface BenchCliOptions {
  scenario?: BenchmarkScenarioId;
  noReplanner: boolean;
}

export interface BenchNpmConfig {
  scenario?: string;
  noReplanner?: string;
}

export interface BenchmarkAlert {
  id: number;
  serviceId: number;
  serviceSlug: string;
  title: string;
  status: BenchmarkAlertStatus;
  severity: BenchmarkSeverity;
  createdAt: Date | string;
}

export interface BenchmarkIncident {
  id: number;
  title: string;
  serviceSlug: string;
  severity: BenchmarkSeverity;
  status: "open" | "resolved";
}

export interface BenchmarkState {
  alerts: BenchmarkAlert[];
  incidents: BenchmarkIncident[];
}

export interface BenchmarkResult {
  scenario: BenchmarkScenarioId;
  strategy: BenchmarkStrategyName;
  accuracy: boolean;
  llmCalls: number;
  latencyMs: number;
}

const scenarioIds: readonly BenchmarkScenarioId[] = ["C1", "C2", "C3"];
const strategyRegistry: readonly ReasoningStrategy[] = [
  reactStrategy,
  planAndExecuteStrategy,
];

function parseScenario(value: string): BenchmarkScenarioId {
  const normalized = value.toUpperCase();
  if (!scenarioIds.includes(normalized as BenchmarkScenarioId)) {
    throw new DomainError(`Unknown scenario: ${value}`, "VALIDATION");
  }
  return normalized as BenchmarkScenarioId;
}

function isEnabled(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

export function parseBenchArguments(
  args: string[],
  npmConfig: BenchNpmConfig = {
    scenario: process.env.npm_config_scenario,
    noReplanner: process.env.npm_config_no_replanner,
  },
): BenchCliOptions {
  let scenario: BenchmarkScenarioId | undefined;
  let scenarioProvided = false;
  let noReplanner = isEnabled(npmConfig.noReplanner);
  let noReplannerProvided = false;
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--scenario") {
      if (scenarioProvided) {
        throw new DomainError("Duplicate option: --scenario", "VALIDATION");
      }
      const value = args[index + 1]?.toUpperCase();
      if (!value || value.startsWith("--")) {
        throw new DomainError(
          "--scenario requires C1, C2, or C3",
          "VALIDATION",
        );
      }
      scenario = parseScenario(value);
      scenarioProvided = true;
      index += 1;
    } else if (arg === "--no-replanner") {
      if (noReplannerProvided) {
        throw new DomainError(
          "Duplicate option: --no-replanner",
          "VALIDATION",
        );
      }
      noReplanner = true;
      noReplannerProvided = true;
    } else {
      positional.push(arg);
    }
  }

  if (!scenarioProvided && npmConfig.scenario) {
    let value = npmConfig.scenario;
    if (value === "true") {
      value = positional.shift() ?? "";
    } else if (positional[0] === value) {
      positional.shift();
    }
    if (!value) {
      throw new DomainError(
        "--scenario requires C1, C2, or C3",
        "VALIDATION",
      );
    }
    scenario = parseScenario(value);
    scenarioProvided = true;
  }
  if (positional.length > 0) {
    throw new DomainError(`Unknown option: ${positional[0]}`, "VALIDATION");
  }
  if (npmConfig.scenario && scenarioProvided && npmConfig.scenario !== "true") {
    throw new DomainError("Duplicate option: --scenario", "VALIDATION");
  }
  if (isEnabled(npmConfig.noReplanner) && noReplannerProvided) {
    throw new DomainError("Duplicate option: --no-replanner", "VALIDATION");
  }

  return { scenario, noReplanner };
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const numberWords: Record<number, string[]> = {
  0: ["zero", "nenhum", "nenhuma", "none", "no"],
  1: ["um", "uma", "one"],
  2: ["dois", "duas", "two"],
  3: ["tres", "three"],
  4: ["quatro", "four"],
  5: ["cinco", "five"],
  6: ["seis", "six"],
  7: ["sete", "seven"],
  8: ["oito", "eight"],
  9: ["nove", "nine"],
  10: ["dez", "ten"],
};

function answerContainsAlertCount(
  answer: string,
  expected: number,
  requiredContext: RegExp,
): boolean {
  const normalized = normalizeText(answer);
  const numberTokens = [String(expected), ...(numberWords[expected] ?? [])];
  return normalized.split(/[.!?;,]/).some((segment) => {
    const words = segment.match(/[\p{L}\p{N}-]+/gu) ?? [];
    return words.some((word, index) => {
      if (!numberTokens.includes(word)) return false;
      const nearbyWords = words
        .slice(Math.max(0, index - 4), index + 5)
        .join(" ");
      return (
        /\b(?:alerts?|alertas?)\b/.test(nearbyWords) &&
        requiredContext.test(nearbyWords)
      );
    });
  });
}

function sameAlerts(left: BenchmarkAlert[], right: BenchmarkAlert[]): boolean {
  const signature = (alerts: BenchmarkAlert[]) =>
    alerts
      .map(({ id, serviceId, serviceSlug, title, status, severity, createdAt }) => ({
        id,
        serviceId,
        serviceSlug,
        title,
        status,
        severity,
        createdAt:
          createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt),
      }))
      .sort((a, b) => a.id - b.id);
  return JSON.stringify(signature(left)) === JSON.stringify(signature(right));
}

function existingIncidentsUnchanged(
  before: BenchmarkState,
  after: BenchmarkState,
): boolean {
  const afterById = new Map(after.incidents.map((incident) => [incident.id, incident]));
  return before.incidents.every(
    (incident) =>
      JSON.stringify(afterById.get(incident.id)) === JSON.stringify(incident),
  );
}

function newIncidents(before: BenchmarkState, after: BenchmarkState) {
  const existingIds = new Set(before.incidents.map(({ id }) => id));
  return after.incidents.filter(({ id }) => !existingIds.has(id));
}

function sameIncidentState(before: BenchmarkState, after: BenchmarkState): boolean {
  return (
    before.incidents.length === after.incidents.length &&
    existingIncidentsUnchanged(before, after)
  );
}

function parseDate(value: Date | string): number {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function containsExpectedIncidents(
  before: BenchmarkState,
  after: BenchmarkState,
  runPrefix: string,
  expected: Array<{
    title: string;
    serviceSlug: string;
    severity: BenchmarkSeverity;
    status: "open" | "resolved";
  }>,
): boolean {
  const created = newIncidents(before, after)
    .filter(({ title }) => title.startsWith(runPrefix))
    .sort((left, right) => left.id - right.id);
  const allNewIncidents = newIncidents(before, after);
  return (
    allNewIncidents.length === expected.length &&
    created.length === expected.length &&
    created.every((incident, index) => {
      const item = expected[index];
      return (
        incident.title === item.title &&
        incident.serviceSlug === item.serviceSlug &&
        incident.severity === item.severity &&
        incident.status === item.status
      );
    })
  );
}

export function checkScenarioAccuracy(
  scenario: BenchmarkScenarioId,
  answer: string,
  before: BenchmarkState,
  after: BenchmarkState,
  runPrefix: string,
  incidentTitles: string[],
): boolean {
  if (!sameAlerts(before.alerts, after.alerts)) return false;
  if (!existingIncidentsUnchanged(before, after)) return false;

  if (scenario === "C1") {
    const criticalFiring = after.alerts.filter(
      ({ status, severity }) => status === "firing" && severity === "critical",
    ).length;
    return (
      sameIncidentState(before, after) &&
      answerContainsAlertCount(answer, criticalFiring, /\bcritic/)
    );
  }

  if (scenario === "C2") {
    const [checkoutTitle, paymentTitle, catalogTitle] = incidentTitles;
    if (!checkoutTitle || !paymentTitle || !catalogTitle) return false;
    return containsExpectedIncidents(before, after, runPrefix, [
      {
        title: checkoutTitle,
        serviceSlug: "checkout-api",
        severity: "high",
        status: "resolved",
      },
      {
        title: paymentTitle,
        serviceSlug: "payments-api",
        severity: "high",
        status: "open",
      },
      {
        title: catalogTitle,
        serviceSlug: "catalog-api",
        severity: "high",
        status: "open",
      },
    ]);
  }

  const oldestFiring = before.alerts
    .filter(({ status }) => status === "firing")
    .sort(
      (left, right) =>
        parseDate(left.createdAt) - parseDate(right.createdAt) ||
        left.id - right.id,
    )[0];
  const [incidentTitle] = incidentTitles;
  if (!oldestFiring || !incidentTitle) return false;

  const remaining = before.alerts.filter(
    ({ status }) => status === "firing",
  ).length - 1;
  return (
    containsExpectedIncidents(before, after, runPrefix, [
      {
        title: incidentTitle,
        serviceSlug: oldestFiring.serviceSlug,
        severity: oldestFiring.severity,
        status: "open",
      },
    ]) &&
    answerContainsAlertCount(
      answer,
      remaining,
      /\b(?:other|outros?|sobr|rest|remain|left)/,
    )
  );
}

export function createdIncidentIdsToCleanup(
  before: BenchmarkState,
  after: BenchmarkState,
  runPrefix: string,
): number[] {
  const existingIds = new Set(before.incidents.map(({ id }) => id));
  return after.incidents
    .filter(
      ({ id, title }) => !existingIds.has(id) && title.startsWith(runPrefix),
    )
    .map(({ id }) => id);
}

function tableCell(value: string, width: number): string {
  return value.padEnd(width);
}

export function formatBenchResults(results: BenchmarkResult[]): string {
  const rows = [
    ["Cenário", "Estratégia", "Acerto", "LLMCalls", "latencyMs"],
    ...results.map(({ scenario, strategy, accuracy, llmCalls, latencyMs }) => [
      scenario,
      strategy,
      accuracy ? "SIM" : "NAO",
      String(llmCalls),
      String(latencyMs),
    ]),
  ];
  const widths = rows[0].map((_, column) =>
    Math.max(...rows.map((row) => row[column].length)),
  );
  const render = (row: string[]) =>
    `| ${row.map((cell, column) => tableCell(cell, widths[column])).join(" | ")} |`;
  const divider = `|-${widths.map((width) => "-".repeat(width)).join("-|-")}-|`;
  return [render(rows[0]), divider, ...rows.slice(1).map(render)].join("\n");
}

interface PreparedScenario {
  prompt: string;
  runPrefix: string;
  incidentTitles: string[];
}

function prepareScenario(
  scenario: BenchmarkScenarioId,
  runId: string,
): PreparedScenario {
  const runPrefix = `OPS-BENCH-${runId}-${scenario}-`;
  if (scenario === "C1") {
    return {
      prompt:
        "Quantos alertas criticos estão disparando? Não abra nem resolva incidentes.",
      runPrefix,
      incidentTitles: [],
    };
  }
  if (scenario === "C2") {
    const incidentTitles = [
      `${runPrefix}checkout`,
      `${runPrefix}payment`,
      `${runPrefix}catalog`,
    ];
    return {
      prompt:
        "Abra três incidentes sev2 para checkout, payment e catalog, nessa mesma ordem e resolva o primeiro. " +
        `Use exatamente estes títulos, na mesma ordem: ${incidentTitles.join("; ")}.`,
      runPrefix,
      incidentTitles,
    };
  }
  const incidentTitle = `${runPrefix}oldest-alert`;
  return {
    prompt:
      "Dos alertas disparando, abra um incidente para o mais antigo, usando a mesma severidade do alerta. " +
      `Use exatamente este título: ${incidentTitle}. Diga quantos outros alertas disparando sobraram, sem alterar o status do alerta.`,
    runPrefix,
    incidentTitles: [incidentTitle],
  };
}

async function readDatabaseState(): Promise<BenchmarkState> {
  const [services, alerts, incidents] = await Promise.all([
    Service.findAll({ attributes: ["id", "slug"] }),
    Alert.findAll({ order: [["id", "ASC"]] }),
    Incident.findAll({ order: [["id", "ASC"]] }),
  ]);
  const serviceSlugs = new Map(services.map(({ id, slug }) => [id, slug]));
  return {
    alerts: alerts.map((alert) => {
      const serviceSlug = serviceSlugs.get(alert.serviceId);
      if (!serviceSlug) {
        throw new Error(
          `Alert ${alert.id} references missing service ${alert.serviceId}`,
        );
      }
      return {
        id: alert.id,
        serviceId: alert.serviceId,
        serviceSlug,
        title: alert.title,
        status: alert.status,
        severity: alert.severity,
        createdAt: alert.createdAt,
      };
    }),
    incidents: incidents.map((incident) => {
      const serviceSlug = serviceSlugs.get(incident.serviceId);
      if (!serviceSlug) {
        throw new Error(
          `Incident ${incident.id} references missing service ${incident.serviceId}`,
        );
      }
      return {
        id: incident.id,
        title: incident.title,
        serviceSlug,
        severity: incident.severity,
        status: incident.status,
      };
    }),
  };
}

async function cleanupRunIncidents(
  before: BenchmarkState,
  runPrefix: string,
): Promise<void> {
  const after = await readDatabaseState();
  const incidentIds = createdIncidentIdsToCleanup(before, after, runPrefix);
  if (incidentIds.length > 0) {
    await Incident.destroy({ where: { id: incidentIds } });
  }
}

function strategyName(
  strategy: ReasoningStrategy,
): BenchmarkStrategyName | undefined {
  if (strategy.name === "react" || strategy.name === "plan-and-execute") {
    return strategy.name;
  }
  return undefined;
}

export async function runBenchmarks(
  options: BenchCliOptions,
): Promise<BenchmarkResult[]> {
  const scenarios = options.scenario ? [options.scenario] : scenarioIds;
  const results: BenchmarkResult[] = [];

  for (const scenario of scenarios) {
    for (const strategy of strategyRegistry) {
      const name = strategyName(strategy);
      if (!name) {
        throw new Error(`Unsupported benchmark strategy: ${strategy.name}`);
      }
      await seedOperationalDatabase();
      const before = await readDatabaseState();
      const prepared = prepareScenario(scenario, randomUUID());
      let result: ReasoningResult | undefined;
      let after: BenchmarkState | undefined;
      let runFailure: unknown;
      let failed = false;

      try {
        result = await strategy.run(prepared.prompt, {
          noReplanner: options.noReplanner,
        });
        after = await readDatabaseState();
      } catch (error) {
        failed = true;
        runFailure = error;
      }

      let cleanupFailure: unknown;
      let cleanupFailed = false;
      try {
        await cleanupRunIncidents(before, prepared.runPrefix);
      } catch (error) {
        cleanupFailed = true;
        cleanupFailure = error;
      }

      if (failed && cleanupFailed) {
        throw new AggregateError(
          [runFailure, cleanupFailure],
          `Scenario ${scenario} failed and its benchmark incidents could not be cleaned up`,
        );
      }
      if (failed) throw runFailure;
      if (cleanupFailed) throw cleanupFailure;
      if (!result || !after) {
        throw new Error(`Scenario ${scenario} completed without a result`);
      }
      results.push({
        scenario,
        strategy: name,
        accuracy: checkScenarioAccuracy(
          scenario,
          result.answer,
          before,
          after,
          prepared.runPrefix,
          prepared.incidentTitles,
        ),
        llmCalls: result.metrics.calls,
        latencyMs: result.metrics.latencyMs,
      });
    }
  }

  return results;
}

async function main(): Promise<void> {
  const options = parseBenchArguments(process.argv.slice(2));
  try {
    const results = await runBenchmarks(options);
    process.stdout.write(`${formatBenchResults(results)}\n`);
    if (results.some(({ accuracy }) => !accuracy)) process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Benchmark failed: ${message}\n`);
    process.exitCode = 1;
  });
}
