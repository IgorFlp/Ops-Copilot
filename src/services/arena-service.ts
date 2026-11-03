import { DomainError } from "../errors/domain-error.js";
import { defaultStrategies } from "../agent/index.js";
import { withReflection } from "../agents/reflection.js";
import {
  ReasoningResult,
  ReasoningStrategy,
  StrategyRunOptions,
} from "../agents/types.js";

export const strategies: ReasoningStrategy[] = [
  ...defaultStrategies,
  ...defaultStrategies.map((strategy) => withReflection(strategy)),
];

export interface ArenaRunOptions extends StrategyRunOptions {
  strategyNames?: string[];
}

export interface ArenaResult {
  strategy: string;
  result: ReasoningResult;
}

export function createArenaService(
  availableStrategies: ReasoningStrategy[] = strategies,
) {
  return {
    async run(
      input: string,
      options: ArenaRunOptions = {},
    ): Promise<ArenaResult[]> {
      if (!input.trim()) {
        throw new DomainError("Input is required", "VALIDATION");
      }
      const selectedNames =
        options.strategyNames ??
        availableStrategies
          .filter(({ name }) => !name.startsWith("reflect:"))
          .map(({ name }) => name);
      if (selectedNames.length === 0) {
        throw new DomainError(
          "Select at least one strategy",
          "VALIDATION",
        );
      }
      const selected = selectedNames.map((name) => {
        const strategy = availableStrategies.find(
          (candidate) => candidate.name === name,
        );
        if (!strategy) {
          throw new DomainError(`Unknown strategy: ${name}`, "VALIDATION");
        }
        return strategy;
      });
      return Promise.all(
        selected.map(async (strategy) => ({
          strategy: strategy.name,
          result: await strategy.run(input, {
            maxIterations: options.maxIterations,
            maxReflection: options.maxReflection,
          }),
        })),
      );
    },
  };
}

export const arenaService = createArenaService();
