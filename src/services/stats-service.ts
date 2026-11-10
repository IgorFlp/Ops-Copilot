import { DomainError } from "../errors/domain-error.js";
import { getDefaultRequestStore } from "../store/default-request-store.js";
import type { RequestRecord } from "../store/request-store.js";

export const SINCE_PATTERN = /^\d+[hd]$/;
export const SINCE_MESSAGE = "since must be a duration like 24h or 7d";
export const FREE_TIER_SUFFIX = ":free";
export const DEFAULT_COST_PER_TOKEN = 0.000001;
export const UNKNOWN_GROUP = "unknown";

const SINCE_UNIT_MS: Record<string, number> = {
  h: 3_600_000,
  d: 86_400_000,
};

export interface StatsLatency {
  p50: number | null;
  p95: number | null;
}

export interface StatsGroup {
  total: number;
  errors: number;
  tokens: number;
  cost: number;
  latency: StatsLatency;
}

export interface StatsResult extends StatsGroup {
  byRoute: Record<string, StatsGroup>;
  byModel: Record<string, StatsGroup>;
}

export function parseSince(value: string): {
  window: string;
  sinceMs: number;
} {
  if (typeof value !== "string" || !SINCE_PATTERN.test(value)) {
    throw new DomainError(SINCE_MESSAGE, "VALIDATION");
  }
  const amount = Number(value.slice(0, -1));
  const unitMs = SINCE_UNIT_MS[value.slice(-1)];
  const sinceMs = amount * unitMs;
  if (!Number.isSafeInteger(sinceMs) || sinceMs < 0) {
    throw new DomainError(SINCE_MESSAGE, "VALIDATION");
  }
  return { window: value, sinceMs };
}

export function isFreeTierModel(model: string | null): boolean {
  return typeof model === "string" && model.endsWith(FREE_TIER_SUFFIX);
}

export function requestCost(record: RequestRecord): number {
  if (isFreeTierModel(record.modelUsed)) return 0;
  const tokens = record.promptTokens ?? 0;
  if (tokens <= 0) return 0;
  return tokens * DEFAULT_COST_PER_TOKEN;
}

export function percentile(
  sorted: readonly number[],
  p: number,
): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

function roundCost(value: number): number {
  return Number(value.toFixed(6));
}

interface Bucket {
  total: number;
  errors: number;
  tokens: number;
  cost: number;
  latencies: number[];
}

function newBucket(): Bucket {
  return { total: 0, errors: 0, tokens: 0, cost: 0, latencies: [] };
}

function accumulate(bucket: Bucket, record: RequestRecord): void {
  bucket.total += 1;
  if (record.status === "failed") bucket.errors += 1;
  if (record.promptTokens !== null) bucket.tokens += record.promptTokens;
  bucket.cost += requestCost(record);
  if (record.latencyMs !== null) bucket.latencies.push(record.latencyMs);
}

function finalize(bucket: Bucket): StatsGroup {
  const sorted = [...bucket.latencies].sort((a, b) => a - b);
  return {
    total: bucket.total,
    errors: bucket.errors,
    tokens: bucket.tokens,
    cost: roundCost(bucket.cost),
    latency: {
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
    },
  };
}

function groupInto(
  records: readonly RequestRecord[],
  key: (record: RequestRecord) => string,
): Record<string, StatsGroup> {
  const buckets = new Map<string, Bucket>();
  for (const record of records) {
    const label = key(record);
    let bucket = buckets.get(label);
    if (!bucket) {
      bucket = newBucket();
      buckets.set(label, bucket);
    }
    accumulate(bucket, record);
  }
  const groups: Record<string, StatsGroup> = {};
  for (const [label, bucket] of buckets) {
    groups[label] = finalize(bucket);
  }
  return groups;
}

export function computeStats(records: readonly RequestRecord[]): StatsResult {
  const overall = newBucket();
  for (const record of records) accumulate(overall, record);
  return {
    ...finalize(overall),
    byRoute: groupInto(records, (record) => record.strategy ?? UNKNOWN_GROUP),
    byModel: groupInto(records, (record) => record.modelUsed ?? UNKNOWN_GROUP),
  };
}

export interface StatsStore {
  listRequestsSince(since: string): Promise<RequestRecord[]>;
}

export class StatsService {
  constructor(private readonly store: StatsStore = getDefaultRequestStore()) {}

  async getStats(window: string): Promise<StatsResult> {
    const { sinceMs } = parseSince(window);
    const until = Date.now();
    const since = new Date(until - sinceMs);
    const records = await this.store.listRequestsSince(since.toISOString());
    return computeStats(records);
  }
}

let defaultService: StatsService | undefined;

export function getDefaultStatsService(): StatsService {
  defaultService ??= new StatsService();
  return defaultService;
}
