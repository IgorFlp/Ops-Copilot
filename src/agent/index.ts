import { planAndExecuteStrategy } from "../agents/plan-and-execute.js";
import { reactStrategy } from "../agents/react.js";
import { withReflection } from "../agents/reflection.js";
import type { ReasoningStrategy } from "../agents/types.js";
import { DomainError } from "../errors/domain-error.js";

export type ReflectionDecorator = (
  strategy: ReasoningStrategy,
) => ReasoningStrategy;

export interface ResolvedStrategy {
  strategy: ReasoningStrategy;
  reflected: boolean;
}

export interface StrategyRegistry {
  resolve(name?: string, reflect?: boolean): ResolvedStrategy;
}

const defaultStrategies = [reactStrategy, planAndExecuteStrategy];

export function createStrategyRegistry(
  availableStrategies: ReasoningStrategy[] = defaultStrategies,
  decorate: ReflectionDecorator = withReflection,
): StrategyRegistry {
  const byName = new Map<string, ReasoningStrategy>();
  for (const strategy of availableStrategies) {
    if (byName.has(strategy.name)) {
      throw new Error(`Duplicate strategy name: ${strategy.name}`);
    }
    byName.set(strategy.name, strategy);
  }

  return {
    resolve(name = "react", reflect = false): ResolvedStrategy {
      const strategy = byName.get(name);
      if (!strategy) {
        throw new DomainError(
          `Unknown strategy: ${name}`,
          "UNSUPPORTED_STRATEGY",
        );
      }
      return {
        strategy: reflect ? decorate(strategy) : strategy,
        reflected: reflect,
      };
    },
  };
}

export const strategyRegistry = createStrategyRegistry();
