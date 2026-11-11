import { useCallback, useMemo, useState } from "react";
import { STORAGE_KEYS, readStorage, writeStorage } from "../lib/storage";
import { STRATEGIES, type Strategy } from "../types/chat";

/** `auto` lets the backend router choose the route. */
export type StrategySelection = Strategy | "auto";

export const STRATEGY_SELECTIONS: StrategySelection[] = ["auto", ...STRATEGIES];

function isSelection(value: string | null): value is StrategySelection {
  return value !== null && (STRATEGY_SELECTIONS as readonly string[]).includes(value);
}

export interface StrategyValue {
  strategy: StrategySelection;
  setStrategy(next: StrategySelection): void;
}

export function useStrategy(): StrategyValue {
  const [strategy, setStrategyState] = useState<StrategySelection>(() => {
    const stored = readStorage(STORAGE_KEYS.strategy);
    return isSelection(stored) ? stored : "auto";
  });

  const setStrategy = useCallback((next: StrategySelection) => {
    writeStorage(STORAGE_KEYS.strategy, next);
    setStrategyState(next);
  }, []);

  return useMemo(() => ({ strategy, setStrategy }), [strategy, setStrategy]);
}
