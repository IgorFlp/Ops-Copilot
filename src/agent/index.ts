import { getDefaultOpsStore } from "../store/default-ops-store.js";
import type { IncidentServiceStore } from "../services/incident-service.js";
import { createPlanAndExecuteStrategy } from "../agents/plan-and-execute.js";
import { createReactStrategy } from "../agents/react.js";
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

export function createOperationalStrategies(
  store: IncidentServiceStore = getDefaultOpsStore(),
): ReasoningStrategy[] {
  return [
    createReactStrategy(undefined, store),
    createPlanAndExecuteStrategy(undefined, store),
  ];
}

export const defaultStrategies = createOperationalStrategies();

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
