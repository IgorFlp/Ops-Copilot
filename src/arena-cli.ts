import { DomainError } from "./errors/domain-error.js";
import type { ArenaResult } from "./services/arena-service.js";

const strategyNames: ReadonlySet<string> = new Set([
  "react",
  "plan-and-execute",
]);

export interface ArenaCliOptions {
  input: string;
  strategies?: string[];
  maxIterations?: number;
}

export interface NpmCliConfig {
  strategies?: string;
  maxIterations?: string;
}

export function parseArenaCliArguments(
  args: string[],
  npmConfig: NpmCliConfig = {
    strategies: process.env.npm_config_strategies,
    maxIterations: process.env.npm_config_max_iterations,
  },
): ArenaCliOptions {
  const positional: string[] = [];
  let strategies: string[] | undefined;
  let maxIterations: number | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--strategies") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new DomainError(
          "--strategies requires a strategy name",
          "VALIDATION",
        );
      }
      strategies = value.split(",").map((name) => name.trim()).filter(Boolean);
      index += 1;
    } else if (arg === "--max-iterations") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new DomainError(
          "--max-iterations requires an integer from 1 to 100",
          "VALIDATION",
        );
      }
      maxIterations = Number(value);
      if (
        !Number.isSafeInteger(maxIterations) ||
        maxIterations < 1 ||
        maxIterations > 100
      ) {
        throw new DomainError(
          "--max-iterations must be an integer from 1 to 100",
          "VALIDATION",
        );
      }
      index += 1;
    } else if (arg.startsWith("--")) {
      throw new DomainError(`Unknown option: ${arg}`, "VALIDATION");
    } else {
      positional.push(arg);
    }
  }

  if (maxIterations === undefined && npmConfig.maxIterations) {
    let value = npmConfig.maxIterations;
    if (value === "true") {
      let valueIndex = -1;
      for (let index = positional.length - 1; index >= 0; index -= 1) {
        if (/^\d+$/.test(positional[index])) {
          valueIndex = index;
          break;
        }
      }
      value =
        valueIndex === -1
          ? positional.pop() ?? ""
          : positional.splice(valueIndex, 1)[0];
    } else if (positional.at(-1) === value) {
      positional.pop();
    }
    maxIterations = Number(value);
    if (
      !Number.isSafeInteger(maxIterations) ||
      maxIterations < 1 ||
      maxIterations > 100
    ) {
      throw new DomainError(
        "--max-iterations must be an integer from 1 to 100",
        "VALIDATION",
      );
    }
  }
  if (!strategies && npmConfig.strategies) {
    if (npmConfig.strategies === "true") {
      const value = positional.pop();
      if (value === undefined) {
        throw new DomainError(
          "--strategies requires a strategy name",
          "VALIDATION",
        );
      }
      strategies = value.split(",").map((name) => name.trim()).filter(Boolean);
    } else {
      strategies = npmConfig.strategies
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
      if (positional.at(-1) === npmConfig.strategies) positional.pop();
    }
  }

  if (positional.length === 0 || !positional.join(" ").trim()) {
    throw new DomainError(
      'Usage: npm run arena -- "input" [--strategies react,plan-and-execute] [--max-iterations 8]',
      "VALIDATION",
    );
  }
  if (strategies?.length === 0) {
    throw new DomainError(
      "--strategies must include at least one strategy",
      "VALIDATION",
    );
  }
  for (const strategy of strategies ?? []) {
    if (!strategyNames.has(strategy)) {
      throw new DomainError(`Unknown strategy: ${strategy}`, "VALIDATION");
    }
  }

  return {
    input: positional.join(" ").trim(),
    ...(strategies ? { strategies } : {}),
    ...(maxIterations === undefined ? {} : { maxIterations }),
  };
}

export function formatArenaResults(results: ArenaResult[]): string {
  return JSON.stringify(results, null, 2);
}
